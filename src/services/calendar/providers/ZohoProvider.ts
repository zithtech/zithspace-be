import axios from "axios";
import { ICalendarProvider, CalendarEventData, ProviderAuthResult, ProviderTokenResult, IncrementalSyncResult } from "../ICalendarProvider";

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID!;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET!;
const ZOHO_REDIRECT_URI = process.env.ZOHO_REDIRECT_URI!;
const ZOHO_AUTH_URL = "https://accounts.zoho.in/oauth/v2/auth";
const ZOHO_TOKEN_URL = "https://accounts.zoho.in/oauth/v2/token";
const ZOHO_CALENDAR_API = "https://calendar.zoho.in/api/v1";

export class ZohoProvider implements ICalendarProvider {
    getAuthUrl(state: string): string {
        const params = new URLSearchParams({
            response_type: "code",
            client_id: ZOHO_CLIENT_ID,
            redirect_uri: ZOHO_REDIRECT_URI,
            scope: "ZohoCalendar.calendar.all,ZohoCalendar.event.all,ZohoMeeting.meeting.ALL,WorkDrive.files.ALL,WorkDrive.workspace.ALL",
            access_type: "offline",
            prompt: "consent",
            state: state,
        });
        return `${ZOHO_AUTH_URL}?${params.toString()}`;
    }

    async handleCallback(code: string, state: string): Promise<ProviderAuthResult> {
        const params = new URLSearchParams({
            code,
            client_id: ZOHO_CLIENT_ID,
            client_secret: ZOHO_CLIENT_SECRET,
            redirect_uri: ZOHO_REDIRECT_URI,
            grant_type: "authorization_code",
        });

        const tokenResponse = await axios.post(`${ZOHO_TOKEN_URL}?${params.toString()}`);
        const { access_token, refresh_token: new_refresh_token, expires_in } = tokenResponse.data;

        if (!access_token) {
            throw new Error("Token exchange failed");
        }

        let calendarId: string | undefined;
        try {
            const calResponse = await axios.get(`${ZOHO_CALENDAR_API}/calendars`, {
                headers: { Authorization: `Zoho-oauthtoken ${access_token}` },
            });
            const calendars: any[] = calResponse.data?.calendars || [];
            const defaultCal = calendars.find((c: any) => c.isdefault) || calendars[0];
            calendarId = defaultCal?.uid;
        } catch (calErr) {
            console.warn("Could not fetch Zoho calendars:", calErr);
        }

        return {
            accessToken: access_token,
            refreshToken: new_refresh_token,
            expiresIn: expires_in || 3600,
            calendarId,
        };
    }

    async getEvents(accessToken: string, calendarId: string, startDate?: Date, endDate?: Date): Promise<any[]> {
        console.log(`[ZohoProvider] Fetching events for calendar: ${calendarId}`);
        const params: any = {};
        if (startDate) params.start_time = this.toZohoDate(startDate, false);
        if (endDate) params.end_time = this.toZohoDate(endDate, false);

        const response = await axios.get(
            `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events`,
            {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                params
            }
        );

        return response.data?.events || [];
    }

    async getIncrementalChanges(accessToken: string, calendarId: string, token?: string): Promise<IncrementalSyncResult> {
        const headers: any = { Authorization: `Zoho-oauthtoken ${accessToken}` };

        console.log(`[ZohoProvider] Full sync (always full sync for Zoho to support deletions/updates properly)`);

        const response = await axios.get(
            `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events`,
            {
                headers,
                validateStatus: () => true, // Don't throw on 4xx
            }
        );

        if (response.status >= 400) {
            throw new Error(`Zoho incremental sync failed (${response.status}): ${JSON.stringify(response.data)}`);
        }

        // The response natively only includes events modified since the token, 
        // avoiding both excessive payloads and the recurring 'range' unrolling issue!

        let events = response.data?.events || [];

        // The new token is the current time in ISO format for storage
        const now = new Date();
        const nextToken = now.toISOString();

        return {
            events,
            nextToken,
            hasMore: false,
        };
    }

    private formatMeetingUpdateTime(dateInput: string | Date): string {
        const d = new Date(dateInput);

        const year = d.getUTCFullYear();
        const month = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");

        const hours = String(d.getUTCHours()).padStart(2, "0");
        const minutes = String(d.getUTCMinutes()).padStart(2, "0");
        const seconds = String(d.getUTCSeconds()).padStart(2, "0");

        return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+00:00`;
    }

    async createEvent(accessToken: string, calendarId: string, eventData: CalendarEventData): Promise<any> {
        const payload = this.mapToZohoPayload(eventData, false);
        const formBody = new URLSearchParams();
        formBody.append("eventdata", JSON.stringify(payload));

        const response = await axios.post(
            `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events`,
            formBody,
            {
                headers: {
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );
        return response.data?.events?.[0];
    }

    private async getEvent(accessToken: string, calendarId: string, externalId: string): Promise<any | null> {
        // 1. Try direct fetch by trying both EID and raw ID
        const resolved = await this.resolveEventUrl(accessToken, calendarId, externalId);
        if (resolved?.status === "FOUND") return resolved.event;

        // 2. Fallback to list fetch
        console.log(`[ZohoProvider] Falling back to list fetch for ${externalId}`);
        const listRes = await axios.get(
            `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events`,
            { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } }
        );
        const events = listRes.data?.events || [];

        // Prioritize events that have an etag and match the UID (skip "deleted" exceptions which lack etag in list)
        const found = events.find((e: any) =>
            ((e.uid && e.uid.toLowerCase() === externalId.toLowerCase()) ||
                (e.event_id && e.event_id.toLowerCase() === externalId.toLowerCase())) &&
            e.etag
        ) || events.find((e: any) =>
            (e.uid && e.uid.toLowerCase() === externalId.toLowerCase()) ||
            (e.event_id && e.event_id.toLowerCase() === externalId.toLowerCase())
        );

        if (!found && events.length > 0) {
            console.warn(`[ZohoProvider] Event ${externalId} not found in list. First few UIDs:`,
                events.slice(0, 5).map((e: any) => e.uid || e.event_id).join(", "));
        }

        return found || null;
    }

    private async getEventETag(accessToken: string, calendarId: string, externalId: string): Promise<string> {
        const event = await this.getEvent(accessToken, calendarId, externalId);
        return event?.etag || "";
    }



    async updateEvent(accessToken: string, calendarId: string, externalId: string, eventData: CalendarEventData, action?: number, occurrenceDate?: string): Promise<any> {
        const fullUid = externalId.split(/_occ_|_RID/)[0];

        const resolved = await this.resolveEventUrl(accessToken, calendarId, externalId);
        if (resolved?.status !== "FOUND") {
            // If event not found and it's a series update, it might have been deleted and recreated
            // Return a helpful error message
            if (action === 2) {
                throw new Error(`Event not found. The recurring series may have been recreated with a new ID. Please refresh your calendar and try again.`);
            }
            throw new Error(`Could not find Zoho event for update: ${externalId}`);
        }

        let eventUrl = resolved.url;
        const etag = resolved.event?.etag;
        if (!etag) throw new Error("Could not retrieve Zoho event ETag for update");

        const payload: any = { ...this.mapToZohoPayload(eventData, true), etag };
        const existing = resolved.event || {};

        // Define helpers first
        const cleanDate = (d: string) => typeof d === 'string' ? d.replace(/\+/g, "").replace(/0000$/, "Z") : d;
        const forceZ = (dt: any) => {
            if (!dt) return dt;
            return { start: cleanDate(dt.start), end: cleanDate(dt.end), timezone: dt.timezone || "UTC" };
        };


        if (action === 2) {
            payload.isrep = true;

            // Use the rrule from eventData if provided (new rrule), otherwise preserve existing
            let rruleToUse = eventData.rrule || existing.rrule || "";

            // If we have recurringDays in eventData, ALWAYS reconstruct the rrule from recurringDays
            // This ensures that when users uncheck/check days, the new pattern is applied
            if (eventData.recurringDays && eventData.recurringDays.length > 0) {
                const days = eventData.recurringDays.map(d => typeof d === 'string' ? d.replace(/[^A-Z]/g, '') : d).filter(d => !!d).join(",");
                if (days) {
                    rruleToUse = `FREQ=WEEKLY;INTERVAL=1;BYDAY=${days}`;
                    // Always add COUNT=50 when generating meetings to avoid "never ending" error
                    if (eventData.generateMeeting) {
                        rruleToUse += ";COUNT=50";
                    }
                }
            } else if (!rruleToUse && eventData.isRecurring) {
                // Default to daily if no specific pattern found
                rruleToUse = eventData.generateMeeting ? "FREQ=DAILY;INTERVAL=1;COUNT=50" : "FREQ=DAILY;INTERVAL=1";
            }

            // For partial week series (less than 7 days), try without conference first
            const isPartialWeek = eventData.recurringDays && eventData.recurringDays.length > 0 && eventData.recurringDays.length < 7;
            
            console.log(`[ZohoProvider] Conference logic check: generateMeeting=${eventData.generateMeeting}, recurringDays=${JSON.stringify(eventData.recurringDays)}, isPartialWeek=${isPartialWeek}`);

            // Remove conference data for updates to avoid Zoho API limitations
            const updatePayload = { ...payload };
            if (action === 2) {
                // For series updates, remove conference data to prevent "Unable to update meeting" error
                delete updatePayload.conference;
                delete updatePayload.conferenceType;
                delete updatePayload.app_data?.meetingdata;
                console.log(`[ZohoProvider] Removed conference data for series update to avoid Zoho limitations`);
                
                // Add a small delay to ensure Zoho has processed the deletion
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Refresh the event to get fresh ETag before updating
                console.log(`[ZohoProvider] Refreshing event to get fresh ETag before update`);
                const freshEvent = await this.getEvent(accessToken, calendarId, fullUid);
                if (freshEvent && freshEvent.etag) {
                    updatePayload.etag = freshEvent.etag;
                    console.log(`[ZohoProvider] Using fresh ETag: ${freshEvent.etag}`);
                } else {
                    console.log(`[ZohoProvider] No fresh ETag found, using existing ETag`);
                }
            }

            // Also try removing attendees to see if that's the issue
            if (payload.attendees && payload.attendees.length > 0) {
                console.log(`[ZohoProvider] Removing attendees to test if that's causing the issue`);
                delete payload.attendees;
            }
            
            if (rruleToUse) payload.rrule = rruleToUse;

            // recurrence_edittype: "all" is the default for master UID updates, but explicitly sending it can cause pattern mismatch errors
            delete payload.recurrence_edittype;

            payload.dateandtime = forceZ({
                start: this.toZohoDate(eventData.startTime, !!eventData.isAllDay),
                end: this.toZohoDate(eventData.endTime, !!eventData.isAllDay),
                timezone: "UTC",
            });

            // Conference already removed above for all recurring meetings
            delete payload.uid;
            // Keep attendees - don't delete them for series updates

            const formBody = new URLSearchParams();
            formBody.append("eventdata", JSON.stringify(payload));

            console.log(`[ZohoProvider] Series PUT payload:`, JSON.stringify(payload, null, 2));
            console.log(`[ZohoProvider] Series PUT URL:`, resolved.url);

            const putRes = await axios.put(resolved.url, formBody, {
                headers: {
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                validateStatus: () => true,
            });

            console.log(`[ZohoProvider] Series PUT result:`, putRes.status, JSON.stringify(putRes.data, null, 2));

            if (putRes.status < 400) return putRes.data?.events?.[0];

            // If we get a 500 error, try refreshing the etag and retry once
            if (putRes.status === 500) {
                console.log(`[ZohoProvider] Got 500 error, attempting to refresh etag and retry...`);
                console.log(`[ZohoProvider] Using fullUid for refresh: ${fullUid}`);
                const freshEvent = await this.getEvent(accessToken, calendarId, fullUid);
                console.log(`[ZohoProvider] Fresh event result:`, freshEvent ? { etag: freshEvent.etag, uid: freshEvent.uid } : 'NOT FOUND');
                
                if (freshEvent?.etag && freshEvent.etag !== etag) {
                    console.log(`[ZohoProvider] Fresh etag found: ${freshEvent.etag} vs old: ${etag}`);
                    payload.etag = freshEvent.etag;
                    
                    const retryFormBody = new URLSearchParams();
                    retryFormBody.append("eventdata", JSON.stringify(payload));
                    
                    const retryRes = await axios.put(resolved.url, retryFormBody, {
                        headers: {
                            Authorization: `Zoho-oauthtoken ${accessToken}`,
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                        validateStatus: () => true,
                    });
                    
                    console.log(`[ZohoProvider] Retry result:`, retryRes.status, JSON.stringify(retryRes.data, null, 2));
                    if (retryRes.status < 400) return retryRes.data?.events?.[0];
                } else {
                    console.log(`[ZohoProvider] No fresh etag found or same etag. ETag retry failed.`);
                    
                    // Try alternative URL format as fallback
                    console.log(`[ZohoProvider] Trying alternative URL format...`);
                    const alternativeUrl = `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events/EID${fullUid}`;
                    
                    const altFormBody = new URLSearchParams();
                    altFormBody.append("eventdata", JSON.stringify(payload));
                    
                    const altRes = await axios.put(alternativeUrl, altFormBody, {
                        headers: {
                            Authorization: `Zoho-oauthtoken ${accessToken}`,
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                        validateStatus: () => true,
                    });
                    
                    console.log(`[ZohoProvider] Alternative URL result:`, altRes.status, JSON.stringify(altRes.data, null, 2));
                    if (altRes.status < 400) return altRes.data?.events?.[0];
                    
                    // If that fails, try minimal payload (just title, date, rrule)
                    console.log(`[ZohoProvider] Trying minimal payload...`);
                    const minimalPayload = {
                        title: payload.title,
                        dateandtime: payload.dateandtime,
                        isrep: payload.isrep,
                        rrule: payload.rrule,
                        etag: payload.etag
                    };
                    
                    const minFormBody = new URLSearchParams();
                    minFormBody.append("eventdata", JSON.stringify(minimalPayload));
                    
                    const minRes = await axios.put(resolved.url, minFormBody, {
                        headers: {
                            Authorization: `Zoho-oauthtoken ${accessToken}`,
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                        validateStatus: () => true,
                    });
                    
                    console.log(`[ZohoProvider] Minimal payload result:`, minRes.status, JSON.stringify(minRes.data, null, 2));
                    if (minRes.status < 400) return minRes.data?.events?.[0];
                    
                    // If all else fails, try delete + recreate approach for recurring meetings
                    console.log(`[ZohoProvider] All update attempts failed, trying delete + recreate approach...`);
                    if (eventData.generateMeeting) {
                        try {
                            // Delete the entire series
                            await this.deleteEvent(accessToken, calendarId, fullUid, 2);
                            console.log(`[ZohoProvider] Series deleted successfully, recreating...`);
                            
                            // Wait a moment for Zoho to process
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            // Recreate with new data
                            const recreatePayload = {
                                title: eventData.title,
                                dateandtime: payload.dateandtime,
                                isallday: eventData.isAllDay,
                                isrep: true,
                                rrule: payload.rrule,
                                conference: "zmeeting",
                                // Only include attendees if there are valid ones
                                ...(eventData.attendees && eventData.attendees.length > 0 && {
                                    attendees: eventData.attendees.filter(email => email && email.trim()).map(email => ({ email }))
                                })
                            };
                            
                            const createFormBody = new URLSearchParams();
                            createFormBody.append("eventdata", JSON.stringify(recreatePayload));
                            
                            const createRes = await axios.post(`${ZOHO_CALENDAR_API}/calendars/${calendarId}/events`, createFormBody, {
                                headers: {
                                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                                    "Content-Type": "application/x-www-form-urlencoded",
                                },
                                validateStatus: () => true,
                            });
                            
                            console.log(`[ZohoProvider] Recreate result:`, createRes.status, JSON.stringify(createRes.data, null, 2));
                            if (createRes.status < 400) return createRes.data?.events?.[0];
                            
                        } catch (recreateErr) {
                            console.log(`[ZohoProvider] Delete + recreate failed:`, recreateErr.message);
                        }
                    }
                }
            }

            throw new Error(`Zoho series PUT failed (${putRes.status}): ${JSON.stringify(putRes.data)}`);
        }

        else if (action === 0 || action === 1) {
            delete payload.isrep;
            delete payload.rrule;
            // action=0: "only", action=1: "following" (Zoho docs suggest 'following' over 'thisandfollowing')
            payload.recurrence_edittype = action === 0 ? "only" : "following";
            
            // For occurrence updates, use the new time from eventData, not existing
            payload.dateandtime = forceZ({
                start: this.toZohoDate(eventData.startTime, !!eventData.isAllDay),
                end: this.toZohoDate(eventData.endTime, !!eventData.isAllDay),
                timezone: "UTC",
            });

            if (occurrenceDate) {
                const d = new Date(occurrenceDate);
                const isoStr = d.toISOString();
                payload.recurrenceid = existing.isallday
                    ? isoStr.split("T")[0].replace(/-/g, "")
                    : isoStr.replace(/[-:]/g, "").split(".")[0] + "Z";
                payload.recurrenceid = cleanDate(payload.recurrenceid);
            }
            // Only delete conference if not generating a meeting
            if (!eventData.generateMeeting) {
                delete payload.conference;
            }
            delete payload.uid;
            // Keep attendees - don't delete them for occurrence updates

            const formBody = new URLSearchParams();
            formBody.append("eventdata", JSON.stringify(payload));

            console.log(`[ZohoProvider] Occurrence PUT payload:`, JSON.stringify(payload, null, 2));
            console.log(`[ZohoProvider] Occurrence PUT url:`, resolved.url);

            const putRes = await axios.put(resolved.url, formBody, {
                headers: {
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                validateStatus: () => true,
            });

            console.log(`[ZohoProvider] Occurrence PUT result:`, putRes.status, JSON.stringify(putRes.data, null, 2));
            if (putRes.status < 400) return putRes.data?.events?.[0];

            // If we get a 500 error, try refreshing the etag and retry once
            if (putRes.status === 500) {
                console.log(`[ZohoProvider] Got 500 error on occurrence, attempting to refresh etag and retry...`);
                const freshEvent = await this.getEvent(accessToken, calendarId, fullUid);
                if (freshEvent?.etag && freshEvent.etag !== etag) {
                    console.log(`[ZohoProvider] Fresh etag found: ${freshEvent.etag} vs old: ${etag}`);
                    payload.etag = freshEvent.etag;
                    
                    const retryFormBody = new URLSearchParams();
                    retryFormBody.append("eventdata", JSON.stringify(payload));
                    
                    const retryRes = await axios.put(resolved.url, retryFormBody, {
                        headers: {
                            Authorization: `Zoho-oauthtoken ${accessToken}`,
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                        validateStatus: () => true,
                    });
                    
                    console.log(`[ZohoProvider] Occurrence retry result:`, retryRes.status, JSON.stringify(retryRes.data, null, 2));
                    if (retryRes.status < 400) return retryRes.data?.events?.[0];
                }
            }

            throw new Error(`Zoho occurrence PUT failed (${putRes.status}): ${JSON.stringify(putRes.data)}`);
        }





        else {
            if (payload.dateandtime) payload.dateandtime = forceZ(payload.dateandtime);

            if (payload.title === existing.title) delete payload.title;
            if (payload.description === existing.description) delete payload.description;
            if (payload.location === existing.location) delete payload.location;
            delete payload.uid;
            // Keep attendees - don't delete them for simple updates

            const formBody = new URLSearchParams();
            formBody.append("eventdata", JSON.stringify(payload));

            console.log(`[ZohoProvider] Simple PUT payload:`, JSON.stringify(payload, null, 2));

            const putRes = await axios.put(resolved.url, formBody, {
                headers: {
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                validateStatus: () => true,
            });

            console.log(`[ZohoProvider] Simple PUT result:`, putRes.status, JSON.stringify(putRes.data, null, 2));
            if (putRes.status < 400) return putRes.data?.events?.[0];
            throw new Error(`Zoho simple PUT failed (${putRes.status}): ${JSON.stringify(putRes.data)}`);
        }

        if (payload.title === existing.title) delete payload.title;
        if (payload.description === existing.description) delete payload.description;
        if (payload.location === existing.location) delete payload.location;
        delete payload.uid;
        delete payload.attendees;

        if (Object.keys(payload).length === 2 && payload.etag && payload.recurrence_edittype) {
            if (eventData.title) payload.title = eventData.title;
        }

        console.log(`[ZohoProvider] Final PATCH payload:`, JSON.stringify({ eventdata: payload }, null, 2));

        try {
            const response = await axios.patch(eventUrl, { eventdata: payload }, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
            });
            return response.data?.events?.[0];
        } catch (error: any) {
            console.error(`[ZohoProvider] PATCH error body:`, JSON.stringify(error.response?.data, null, 2));
            if (error.response?.status === 409) {
                const freshEvent = await this.getEvent(accessToken, calendarId, fullUid);
                if (freshEvent?.etag) {
                    payload.etag = freshEvent.etag;
                    const retryRes = await axios.patch(eventUrl, { eventdata: payload }, {
                        headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, "Content-Type": "application/json" },
                    });
                    return retryRes.data?.events?.[0];
                }
            }
            throw error;
        }
    }

    async deleteEvent(accessToken: string, calendarId: string, externalId: string, action?: number, occurrenceDate?: string): Promise<void> {
        const fullUid = externalId.split(/_occ_|_RID/)[0];
        console.log(`[ZohoProvider] Deleting event. Full UID: ${fullUid}. Action: ${action}`);

        // For single occurrence deletion (action === 0), delete specific occurrence from Zoho
        if (action === 0) {
            console.log(`[ZohoProvider] Single occurrence deletion - deleting from Zoho with recurrence ID`);
            
            // Get the event to determine if it's recurring
            const event = await this.getEvent(accessToken, calendarId, fullUid);
            if (!event) {
                console.warn(`[ZohoProvider] Event ${fullUid} not found for single occurrence deletion`);
                return;
            }

            // If it's a recurring event, use recurrence logic
            if (event.isrecurring) {
                // Use occurrence date to create proper recurrence ID
                let recurrenceId = "";
                console.log(`[ZohoProvider] Event isallday: ${event.isallday}, occurrenceDate: ${occurrenceDate}`);
                
                if (occurrenceDate) {
                    const d = new Date(occurrenceDate);
                    
                    // For all-day events: use YYYYMMDD format
                    // For timed events: use YYYYMMDDThhmmssZ format
                    if (event.isallday) {
                        recurrenceId = d.toISOString().split("T")[0].replace(/-/g, "");
                        console.log(`[ZohoProvider] All-day recurrenceId: ${recurrenceId}`);
                    } else {
                        recurrenceId = d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
                        console.log(`[ZohoProvider] Timed recurrenceId: ${recurrenceId}`);
                    }
                } else if (event.dateandtime?.start) {
                    // Fallback: Use event's own start time
                    const eventStart = new Date(event.dateandtime.start);
                    if (event.isallday) {
                        recurrenceId = eventStart.toISOString().split("T")[0].replace(/-/g, "");
                    } else {
                        recurrenceId = eventStart.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
                    }
                    console.log(`[ZohoProvider] Fallback recurrenceId: ${recurrenceId}`);
                }

                // Delete specific occurrence with recurrence ID
                const deleteData: any = {
                    uid: fullUid,
                    recurrence_edittype: "only",
                    recurrenceid: recurrenceId
                };

                if (event.etag) deleteData.etag = event.etag;

                const params = new URLSearchParams();
                params.append("eventdata", JSON.stringify(deleteData));
                
                const deleteUrl = `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events/${fullUid}?${params.toString()}`;
                
                console.log(`[ZohoProvider] Deleting single occurrence: ${deleteUrl}`);
                console.log(`[ZohoProvider] Delete data:`, JSON.stringify(deleteData, null, 2));

                try {
                    await axios.delete(deleteUrl, {
                        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                    });
                    console.log(`[ZohoProvider] Single occurrence deleted successfully from Zoho`);
                } catch (error: any) {
                    console.error(`[ZohoProvider] Failed to delete single occurrence from Zoho:`, error.response?.data || error.message);
                    // Don't throw error - local exception will still work
                    console.log(`[ZohoProvider] Continuing with local exception handling`);
                }
                
                return; // Don't continue to series deletion logic
            } else {
                // For single (non-recurring) events, just delete directly
                console.log(`[ZohoProvider] Deleting single (non-recurring) event: ${fullUid}`);
                
                const deleteData: any = {
                    uid: fullUid
                };

                if (event.etag) deleteData.etag = event.etag;

                const params = new URLSearchParams();
                params.append("eventdata", JSON.stringify(deleteData));
                
                const deleteUrl = `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events/${fullUid}?${params.toString()}`;
                
                console.log(`[ZohoProvider] Single event delete URL: ${deleteUrl}`);
                console.log(`[ZohoProvider] Single event delete data:`, JSON.stringify(deleteData, null, 2));

                try {
                    await axios.delete(deleteUrl, {
                        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
                    });
                    console.log(`[ZohoProvider] Single event deleted successfully from Zoho`);
                } catch (error: any) {
                    console.error(`[ZohoProvider] Failed to delete single event from Zoho:`, error.response?.data || error.message);
                    throw error;
                }
                
                return; // Don't continue to series deletion logic
            }
        }

        // For series deletion (action === 2) or following (action === 1), proceed with Zoho delete
        const event = await this.getEvent(accessToken, calendarId, fullUid);
        if (!event) {
            console.warn(`[ZohoProvider] Event ${fullUid} already gone from Zoho (not in detail, not in list). Success.`);
            return;
        }

        const etag = event.etag;
        // We still need the resolved URL for the DELETE call
        const resolved = await this.resolveEventUrl(accessToken, calendarId, fullUid);
        let eventUrl = resolved?.url || `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events/${encodeURIComponent(fullUid)}`;

        const deleteData: any = {
            uid: fullUid
        };
        if (etag) deleteData.etag = etag;

        // action 0 = only this, action 1 = this and following, action 2 = series
        if (action !== undefined) {
            // Zoho deletion: 'only' and 'following' are used for instances.
            // For series deletion (action 2), we hit the master UID without edittype.
            const typeMap: any = { 0: "only", 1: "following" };
            if (typeMap[action]) {
                deleteData.recurrence_edittype = typeMap[action];
            }

            // Important: Use original date from _RID suffix if available, 
            // otherwise use occurrenceDate from frontend.
            let ridString = "";
            if (externalId.includes('_RID')) {
                ridString = externalId.split('_RID')[1].split('_')[0];
            }

            if ((action === 0 || action === 1)) {
                if (ridString) {
                    deleteData.recurrenceid = ridString;
                } else if (occurrenceDate) {
                    const d = new Date(occurrenceDate);
                    const isoStr = d.toISOString();
                    if (event?.isallday) {
                        deleteData.recurrenceid = isoStr.split("T")[0].replace(/-/g, "");
                    } else {
                        deleteData.recurrenceid = isoStr.replace(/[-:]/g, "").split(".")[0] + "Z";
                    }
                } else if (event?.dateandtime?.start) {
                    // Fallback: Use the event's own start time as occurrence ID
                    const eventStart = new Date(event.dateandtime.start);
                    const isoStr = eventStart.toISOString();
                    if (event?.isallday) {
                        deleteData.recurrenceid = isoStr.split("T")[0].replace(/-/g, "");
                    } else {
                        deleteData.recurrenceid = isoStr.replace(/[-:]/g, "").split(".")[0] + "Z";
                    }
                    console.log(`[ZohoProvider] Using event start time as recurrenceid: ${deleteData.recurrenceid}`);
                }
            }
        }

        if (action !== undefined || etag) {
            const params = new URLSearchParams();
            params.append("eventdata", JSON.stringify(deleteData));
            eventUrl += `?${params.toString()}`;
        }

        console.log(`[ZohoProvider] Executing DELETE: ${eventUrl}`);

        try {
            const response = await axios.delete(eventUrl, {
                headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            });
            console.log(`[ZohoProvider] DELETE success. Status: ${response.status}. Data:`, JSON.stringify(response.data, null, 2));
        } catch (error: any) {
            if (error.response?.status === 409) {
                console.warn(`[ZohoProvider] 409 Conflict on delete. Waiting 1s and re-fetching ETag...`);
                await new Promise(resolve => setTimeout(resolve, 1000));

                const freshEvent = await this.getEvent(accessToken, calendarId, fullUid);
                if (freshEvent?.etag) {
                    deleteData.etag = freshEvent.etag;
                    const params = new URLSearchParams();
                    params.append("eventdata", JSON.stringify(deleteData));
                    const retryUrl = eventUrl.split("?")[0] + `?${params.toString()}`;

                    try {
                        const retryRes = await axios.delete(retryUrl, {
                            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                        });
                        console.log(`[ZohoProvider] Retry success! Status: ${retryRes.status}`);
                        return;
                    } catch (retryErr: any) {
                        console.error(`[ZohoProvider] Retry failed:`, retryErr.response?.data || retryErr.message);
                        throw retryErr;
                    }
                }
            }

            if (error.response) {
                console.error(`[ZohoProvider] DELETE error response: ${error.response.status}`, JSON.stringify(error.response.data, null, 2));
                if (error.response.status === 404) return;
            }
            throw error;
        }
    }

    async refreshToken(refreshToken: string): Promise<ProviderTokenResult> {
        const params = new URLSearchParams({
            refresh_token: refreshToken,
            client_id: ZOHO_CLIENT_ID,
            client_secret: ZOHO_CLIENT_SECRET,
            grant_type: "refresh_token",
        });

        const response = await axios.post(`${ZOHO_TOKEN_URL}?${params.toString()}`);
        const { access_token, expires_in } = response.data;

        if (!access_token) {
            throw new Error("Failed to refresh Zoho access token");
        }

        return {
            accessToken: access_token,
            expiresIn: expires_in || 3600,
        };
    }

    private mapToZohoPayload(data: CalendarEventData, isUpdate: boolean = false): any {
        const payload: any = {
            title: data.title,
            dateandtime: {
                start: this.toZohoDate(data.startTime, !!data.isAllDay),
                end: this.toZohoDate(data.endTime, !!data.isAllDay),
                timezone: data.isAllDay ? undefined : "UTC", // Use UTC to match the 'Z' suffix
            },
            isallday: !!data.isAllDay,
            isrep: !!data.isRecurring,
        };

        if (data.description) payload.description = data.description;
        if (data.location) payload.location = data.location;

        // if (data.isRecurring) {
        //     if (data.recurringDays && data.recurringDays.length > 0 && data.recurringDays.length < 7) {
        //         const days = data.recurringDays.map(d => typeof d === 'string' ? d.replace(/[^A-Z]/g, '') : d).filter(d => !!d).join(",");
        //         payload.rrule = `FREQ=WEEKLY;INTERVAL=1;BYDAY=${days}`;
        //         // Only add COUNT for fresh creations to avoid breaking existing meet/cal sync
        //         if (data.generateMeeting && !isUpdate) payload.rrule += ";COUNT=50";
        //     } else {
        //         payload.rrule = (data.generateMeeting && !isUpdate) ? "FREQ=DAILY;INTERVAL=1;COUNT=50" : "FREQ=DAILY;INTERVAL=1";
        //     }
        // }

        if (data.isRecurring) {
            if (data.recurringDays && data.recurringDays.length > 0 && data.recurringDays.length < 7) {
                const days = data.recurringDays.map(d => typeof d === 'string' ? d.replace(/[^A-Z]/g, '') : d).filter(d => !!d).join(",");
                payload.rrule = `FREQ=WEEKLY;INTERVAL=1;BYDAY=${days}`;
                if (data.generateMeeting && !isUpdate) payload.rrule += ";COUNT=50";
            } else {
                payload.rrule = (data.generateMeeting && !isUpdate) ? "FREQ=DAILY;INTERVAL=1;COUNT=50" : "FREQ=DAILY;INTERVAL=1";
            }
        }

        if (data.generateMeeting) {
            payload.conference = "zmeeting";
        }

        if (data.attendees && data.attendees.length > 0) {
            payload.attendees = data.attendees.map(email => ({ email }));
        }

        return payload;
    }

    private toZohoDate(iso: string | Date, allDay: boolean): string {
        const date = new Date(iso);
        if (isNaN(date.getTime())) return "";
        const isoStr = date.toISOString();
        if (allDay) {
            return isoStr.split("T")[0].replace(/-/g, ""); // yyyyMMdd
        }
        // Strictly use yyyyMMddTHHmmssZ format for UTC
        return isoStr.replace(/[-:]/g, "").split(".")[0] + "Z";
    }

    private async resolveEventUrl(accessToken: string, calendarId: string, externalId: string, eventObj?: any): Promise<{ url: string, event?: any, status: "FOUND" | "DELETED" | "NOT_FOUND" } | null> {
        if (!externalId) return { url: "", status: "NOT_FOUND" };

        // Strip our tracking suffixes to get the clean Zoho UID
        const cleanId = externalId.split(/_occ_|_RID/)[0];
        const hexPart = cleanId.split("@")[0];
        const idAttempts = new Set<string>();

        // 1. Base IDs
        idAttempts.add(`EID${cleanId}`);
        idAttempts.add(`EID${hexPart}`);
        idAttempts.add(cleanId);
        idAttempts.add(hexPart);

        // 2. Composed IDs (seen in viewEventURL)
        idAttempts.add(`${calendarId}_EID${cleanId}`);
        idAttempts.add(`${calendarId}_EID${hexPart}`);

        // 3. Extract from viewEventURL if provided
        if (eventObj?.viewEventURL) {
            const parts = eventObj.viewEventURL.split("/");
            const lastPart = parts[parts.length - 1];
            if (lastPart) idAttempts.add(lastPart);
        }

        console.log(`[ZohoProvider] Aggressive resolution for ${externalId}. Trials: ${Array.from(idAttempts).join(", ")}`);

        let foundButDeleted = false;
        let lastKnownUrl = "";

        for (const id of idAttempts) {
            const idVariations = [encodeURIComponent(id), id];

            for (const idVar of idVariations) {
                const url = `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events/${idVar}`;
                try {
                    const res = await axios.get(url, {
                        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
                    });
                    const event = res.data?.events?.[0];
                    if (event) {
                        if (event.estatus === "deleted") {
                            foundButDeleted = true;
                            lastKnownUrl = url;
                            continue;
                        }
                        if (event.title || event.dateandtime || event.startdatetime) {
                            return { url, event, status: "FOUND" };
                        }
                    }
                } catch (err: any) {
                    if (err.response?.status !== 404) {
                        console.warn(`[ZohoProvider] Error ${err.response?.status} for ${idVar}`);
                    }
                }
            }
        }

        if (foundButDeleted) {
            return { url: lastKnownUrl, status: "DELETED" };
        }
        return { url: `${ZOHO_CALENDAR_API}/calendars/${calendarId}/events/${encodeURIComponent(externalId)}`, status: "NOT_FOUND" };
    }

    mapToInternalEvent(rawEvent: any): any {
        const uid = rawEvent.uid || rawEvent.event_id;
        return {
            ...rawEvent,
            id: `ZOHO_${uid}`,
            externalId: uid,
            provider: "ZOHO",
            exdate: rawEvent.exdate
        };
    }
}