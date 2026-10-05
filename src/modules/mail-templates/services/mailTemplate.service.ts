// src/modules/mail-templates/services/mailTemplate.service.ts
// Use-case layer: opens the tenant-scoped transaction and applies the rules
// the repositories deliberately stay ignorant of.

import { sanitizeHtmlContent } from '@/utils/htmlSanitizer';
import { withTenant } from '../db/pool';
import * as repo from '../repositories/mailTemplate.repo';
import * as recipients from '../repositories/recipient.repo';
import * as signatureRepo from '../repositories/signature.repo';
import {
  buildDefaultSignature,
  PLACEHOLDER_GROUPS,
  RenderResult,
  renderTemplate,
} from '../placeholders';
import {
  Actor,
  MailSignature,
  MailTemplate,
  MailTemplateError,
  Recipient,
  TemplateCategory,
} from '../types';
import {
  CreateTemplateInput,
  RenderTemplateInput,
  UpdateTemplateInput,
} from '../validators/mailTemplate.validator';

/**
 * The body is rich text from the editor and is rendered back into the compose
 * window as HTML, so it is sanitised ON THE WAY IN — once, here — with the
 * platform's shared rich-text allow-list, rather than trusting every future
 * reader to remember.
 */
function clean<T extends { body?: string }>(input: T): T {
  return input.body === undefined
    ? input
    : { ...input, body: sanitizeHtmlContent(input.body) };
}

/** The placeholder catalogue the editor renders as grouped, clickable chips. */
export function getPlaceholders() {
  return { groups: PLACEHOLDER_GROUPS };
}

export async function listTemplates(
  actor: Actor,
  search?: string,
  category?: string
): Promise<MailTemplate[]> {
  return withTenant(actor.tenantId, (client) => repo.findAll(client, search, category));
}

/** The categories in use, for the library's sidebar. */
export async function listCategories(actor: Actor): Promise<TemplateCategory[]> {
  return withTenant(actor.tenantId, (client) => repo.findCategories(client));
}

export async function getTemplate(actor: Actor, id: string): Promise<MailTemplate> {
  const template = await withTenant(actor.tenantId, (client) => repo.findById(client, id));
  if (!template) throw MailTemplateError.notFound('Template');
  return template;
}

export async function createTemplate(
  actor: Actor,
  input: CreateTemplateInput
): Promise<MailTemplate> {
  return withTenant(actor.tenantId, async (client) => {
    if (await repo.nameExists(client, input.name)) {
      throw MailTemplateError.conflict(`A template named “${input.name}” already exists`);
    }
    // Same transaction as the insert, so the partial unique index on
    // (tenant_id) WHERE is_default never sees two winners.
    if (input.isDefault) await repo.clearDefault(client);
    return repo.create(client, clean(input), actor.userId);
  });
}

export async function updateTemplate(
  actor: Actor,
  id: string,
  input: UpdateTemplateInput
): Promise<MailTemplate> {
  return withTenant(actor.tenantId, async (client) => {
    if (input.name && (await repo.nameExists(client, input.name, id))) {
      throw MailTemplateError.conflict(`A template named “${input.name}” already exists`);
    }
    if (input.isDefault) await repo.clearDefault(client, id);

    const updated = await repo.update(client, id, clean(input), actor.userId);
    if (!updated) throw MailTemplateError.notFound('Template');
    return updated;
  });
}

export async function deleteTemplate(actor: Actor, id: string): Promise<void> {
  const deleted = await withTenant(actor.tenantId, (client) => repo.remove(client, id));
  if (!deleted) throw MailTemplateError.notFound('Template');
}

/** Move the "offered first in Compose" badge onto this template. */
export async function setDefault(actor: Actor, id: string): Promise<MailTemplate> {
  return withTenant(actor.tenantId, async (client) => {
    await repo.clearDefault(client, id);
    const updated = await repo.update(client, id, { isDefault: true }, actor.userId);
    if (!updated) throw MailTemplateError.notFound('Template');
    return updated;
  });
}

/**
 * This member's signature — theirs if they have saved one, otherwise one built
 * from their own record.
 *
 * Both forms come back: `html` with its placeholders standing (what the editor
 * edits and what gets saved) and `resolvedHtml` with the member's details
 * filled in (what the previews and the compose window show).
 */
export async function getSignature(actor: Actor): Promise<MailSignature> {
  return withTenant(actor.tenantId, async (client) => {
    const sender = await recipients.findSender(client, actor.userId);
    const saved = await signatureRepo.findByUser(client, actor.userId);

    const html = saved?.html ?? buildDefaultSignature(sender?.values ?? {});
    const { body: resolvedHtml } = renderTemplate(
      { subject: '', body: html },
      sender?.values ?? {}
    );

    return {
      html,
      resolvedHtml,
      isAutofilled: !saved,
      updatedAt: saved?.updatedAt ?? null,
      sender,
    };
  });
}

export async function saveSignature(actor: Actor, html: string): Promise<MailSignature> {
  await withTenant(actor.tenantId, (client) =>
    signatureRepo.upsert(client, actor.userId, sanitizeHtmlContent(html))
  );
  return getSignature(actor);
}

/** Throw the member's own signature away and fall back to the autofilled one. */
export async function resetSignature(actor: Actor): Promise<MailSignature> {
  await withTenant(actor.tenantId, (client) => signatureRepo.remove(client, actor.userId));
  return getSignature(actor);
}

export async function searchRecipients(actor: Actor, term?: string): Promise<Recipient[]> {
  return withTenant(actor.tenantId, (client) => recipients.search(client, term));
}

export interface RenderedTemplate extends RenderResult {
  /** Who the values came from, or null when the address matched nobody. */
  recipient: Recipient | null;
  /** The sender's signature, resolved — empty when they have none. */
  signature: string;
}

/**
 * Fill a template in for one recipient.
 *
 * An address that matches nobody is NOT an error — the sender may be writing
 * to someone who is not in the system yet. The template comes back with its
 * tokens still standing and every one of them listed in `unresolved`, which is
 * exactly what the compose window warns about.
 */
export async function renderForRecipient(
  actor: Actor,
  id: string,
  input: RenderTemplateInput
): Promise<RenderedTemplate> {
  return withTenant(actor.tenantId, async (client) => {
    const template = await repo.findById(client, id);
    if (!template) throw MailTemplateError.notFound('Template');

    let recipient: Recipient | null = null;
    if (input.recipientId) {
      recipient =
        input.recipientKind === 'member'
          ? await recipients.findMember(client, input.recipientId)
          : await recipients.findClientContact(client, input.recipientId);
      if (!recipient) throw MailTemplateError.notFound('Recipient');
    } else if (input.email) {
      recipient = await recipients.findByEmail(client, input.email);
    }

    // The sender's own details resolve alongside the recipient's, so a
    // template may sign off with {{my_name}} as well as greet {{client_name}}.
    const sender = await recipients.findSender(client, actor.userId);
    const saved = await signatureRepo.findByUser(client, actor.userId);
    const signatureHtml = saved?.html ?? buildDefaultSignature(sender?.values ?? {});
    const values = { ...(recipient?.values ?? {}), ...(sender?.values ?? {}) };

    // Rendered against the same values, so a signature may greet the recipient
    // too; its own unresolved tokens are not reported, because the writer did
    // not write them here and cannot fix them from the compose window.
    const { body: signature } = renderTemplate({ subject: '', body: signatureHtml }, values);

    return {
      ...renderTemplate(template, values),
      recipient,
      signature,
    };
  });
}
