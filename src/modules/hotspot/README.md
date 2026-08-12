# Hotspot module

Backend for the Hotspot employee area. Mounted at `/api/v2/hotspot`.

The Hotspot **job board** (internally posted openings) is served by the
Opening Management module at `/api/v2/openings` — this module owns the parts
that exist only inside Hotspot: **Circulation** and **Blogs**.

| Surface | What it is |
| --- | --- |
| Circulation | The noticeboard. One-to-many, authored, formal — rich text, categories, pinning. |
| Blogs | The conversation. Plain text and photos, @mentions, reactions, comments. |

That split is why their schemas differ so much: a policy notice needs headings
and lists, a status update needs a photo grid and a comment thread.

## Circulation

The company noticeboard. Any employee posts an important update as rich text
with any number of images and documents; the whole tenant reads it.

### Data

Pure raw SQL, no Prisma. Two tables, both prefixed `hs_`:

| Table | Purpose |
| --- | --- |
| `hs_circulation_posts` | title, HTML body + plain-text search projection, category, pin flag, author, soft-delete |
| `hs_circulation_attachments` | one row per uploaded file, split `image` / `document` by MIME type |
| `hs_circulation_categories` | the tenant's OWN categories; the six built-ins live in code and own no rows |

Tenant isolation is two independent layers: FORCE'd RLS policies keyed on
`app.current_tenant_id`, plus an explicit `tenant_id = $1` in every query.
`withTenant()` in `db/pool.ts` is the only sanctioned way to run a query.

Migrations are forward-only SQL files in `db/migrations`, applied at boot by
`db/migrate.ts` and tracked in `hs_migrations`.

### Authorisation

| Action | Who |
| --- | --- |
| read the feed | any authenticated member of the tenant |
| create a post | any authenticated member of the tenant |
| edit / delete a post | its author, or a moderator |
| pin / unpin | moderators only |
| add a category | any authenticated member of the tenant |
| remove a category | moderators only, and only while no post uses it |

"Moderator" is resolved once per request in `middleware/moderation.ts`:
`super_admin`, or a principal holding `opening.manage`. The same person who
administers the Hotspot job board administers its noticeboard; a dedicated
`hotspot.manage` key would grant nobody anything until an RBAC seed ran.

### Endpoints

```
GET    /api/v2/hotspot/circulation                       list (search, category, authorUserId, mineOnly, page, pageSize)
POST   /api/v2/hotspot/circulation                       create
GET    /api/v2/hotspot/circulation/:id                   read one
PUT    /api/v2/hotspot/circulation/:id                   update
DELETE /api/v2/hotspot/circulation/:id                   soft delete
POST   /api/v2/hotspot/circulation/:id/pin               { isPinned }
POST   /api/v2/hotspot/circulation/:id/attachments       multipart, field "files" (max 10 × 25 MB)
DELETE /api/v2/hotspot/circulation/:id/attachments/:attachmentId

GET    /api/v2/hotspot/circulation/authors               people who have posted, each with postCount
GET    /api/v2/hotspot/circulation/categories            built-ins + tenant's own, each with postCount
POST   /api/v2/hotspot/circulation/categories            { label } -> slug derived server-side
DELETE /api/v2/hotspot/circulation/categories/:categoryId
```

### Categories

Six built-ins ship in code (`BUILT_IN_CATEGORIES`) and are present for every
tenant; they own no rows and cannot be renamed or removed, because a tenant that
deleted "policy" would leave older posts pointing at a label nobody can render.
Anything else a tenant needs goes in `hs_circulation_categories`.

Migration 002 **dropped** the `category` CHECK constraint. That is not a
loosening: a constraint cannot see a per-tenant catalog, so the closed set moved
up a layer to `assertCategoryExists`, which every write path calls. Without it a
caller could post into a category that renders as a raw slug for the whole
company.

Callers send only the human `label`; the slug is derived server-side, so "Town
Hall" and "town  hall!" resolve to the same category rather than two. A label
that already exists returns the existing category instead of a 409 — someone
typing a name that is already there wants that category, not an error.

Attachments follow the reimbursement-v2 receipt flow: multer (disk) → base64 →
R2 → metadata row, with temp files unlinked even when an upload fails midway.

Post bodies are sanitised with `sanitizeHtmlContent` **on write**, and the
`body_text` search projection is derived from the sanitised HTML. Sanitising on
write (not on render) means every reader is safe regardless of which client
displays the post, and a body that reached the table is already clean. The
client cannot supply `body_text` directly — otherwise a post could be made
findable by text that is not in it.

### AI writing assist

```
POST /api/v2/hotspot/ai/circulation/compose    { brief, category, tone, currentTitle?, currentBody? } -> { title, body }
POST /api/v2/hotspot/ai/circulation/grammar    { html } -> { html, changed }
```

Stateless, mounted apart from `/circulation` so its `/:id` routes cannot
swallow them. No permission gate beyond the module's own auth — anyone who may
post an update may get help writing it — then `requireAiAccess` honours the
per-user AI toggle. Generation goes through `services/ai/resolver`, so a tenant
on its own key/model is honoured and the ZAI platform default is the fallback.

**How grammar keeps the markup intact.** Sending HTML to a model and asking it
to "preserve the tags" is a promise the model cannot keep — it drops attributes,
closes tags differently, and the author's formatting quietly degrades. So the
markup never reaches the model. `splitTextRuns` splits the document into tags
and text runs; only the text runs go out, as a JSON array; an array of the *same
length* must come back; the corrections are spliced into the original parts. The
tags are untouched by construction, not by instruction. A length mismatch is
refused outright (502) rather than spliced, because a misaligned splice would
silently scramble the document.

### Migrating manually

```
npx ts-node -r tsconfig-paths/register src/modules/hotspot/db/migrate.ts
```

## Blogs

The social feed at `/api/v2/hotspot/blogs`: an employee posts text and photos,
tags colleagues, and everyone reacts and comments.

### Data

Five tables, all `hs_blog_*`, all raw SQL:

| Table | Purpose |
| --- | --- |
| `hs_blog_posts` | plain-text body, author, soft-delete |
| `hs_blog_images` | one row per photo, ordered |
| `hs_blog_comments` | two levels — a comment, or a reply to one |
| `hs_blog_reactions` | one row per (user, target); a user has at most ONE reaction on a post or comment |
| `hs_blog_mentions` | the authoritative "who was tagged" list |

**`body` is sanitised HTML; `body_text` is its plain-text projection.**
Migration 003 stored plain text, on the reasoning that a status update needs no
formatting. Authors asked for a real editor, so migration 004 added `body_text`
and `body` became HTML from a Tiptap composer.

Both columns exist because HTML alone breaks two things. Search on HTML matches
tag names (`ILIKE '%table%'` hits `<table>`), and mention matching on HTML fails
the moment a name straddles a tag boundary. `body_text` is derived server-side
from the SANITISED html on every write, so it can never claim text the stored
post does not contain. Sanitising happens on write, not render, so every reader
is safe regardless of which client displays the post.

**Mentions are two sources of truth, on purpose.** The body carries the literal
`@Priya Sharma` the author typed and is what everyone reads;
`hs_blog_mentions` is what a notification would read from. `resolveMentions`
keeps them honest: a requested mention is recorded only if the user is real and
active *in this tenant* **and** their display name actually appears in the body.
So deleting `@Priya` from the sentence un-tags her, with no client bookkeeping,
and a crafted request cannot tag someone who was never named.

The trade-off, stated plainly: two colleagues with identical display names
cannot be told apart by the text alone, and both would be tagged. That is rare,
and the alternative — hidden id tokens inside a plain-text field — breaks the
moment someone edits the sentence by hand.

**Reactions** use a nullable `post_id`/`comment_id` pair with a CHECK that
exactly one is set, rather than a `target_type`/`target_id` discriminator. That
keeps real foreign keys, so deleting a post or comment takes its reactions with
it instead of leaving orphans. Two partial unique indexes make "one reaction per
user per target" a database guarantee, so setting a reaction is an upsert that
cannot race with a double click. Tapping the reaction you already have clears it.

### Authorisation

| Action | Who |
| --- | --- |
| read the feed | any authenticated member of the tenant |
| post, comment, react | any authenticated member of the tenant |
| edit a post | its author, or a moderator |
| delete a post | its author, or a moderator |
| **edit** a comment | its author **only** |
| **delete** a comment | its author, the author of the post, or a moderator |

A moderator can remove someone's words but cannot put new words in their mouth —
that asymmetry is why editing a comment is author-only while deleting is not.
The author of a post moderates the conversation underneath it.

### Endpoints

```
GET    /api/v2/hotspot/blogs                       feed (search, authorUserId, mentioningMe, page, pageSize)
GET    /api/v2/hotspot/blogs/mentionable-users     the @ picker (search, limit)
POST   /api/v2/hotspot/blogs                       create { body, mentionUserIds, hasImages }
GET    /api/v2/hotspot/blogs/:id
PUT    /api/v2/hotspot/blogs/:id
DELETE /api/v2/hotspot/blogs/:id                   soft delete

POST   /api/v2/hotspot/blogs/:id/images            multipart, field "files" (max 10 × 15 MB, images only)
DELETE /api/v2/hotspot/blogs/:id/images/:imageId

POST   /api/v2/hotspot/blogs/:id/reactions         { reaction } — same reaction again clears it
DELETE /api/v2/hotspot/blogs/:id/reactions
GET    /api/v2/hotspot/blogs/:id/reactions         who reacted

GET    /api/v2/hotspot/blogs/:id/comments          the whole thread, two levels
POST   /api/v2/hotspot/blogs/:id/comments          { body, parentCommentId?, mentionUserIds }
PUT    /api/v2/hotspot/blogs/comments/:commentId
DELETE /api/v2/hotspot/blogs/comments/:commentId   cascades to its replies
POST   /api/v2/hotspot/blogs/comments/:commentId/reactions
```

`hasImages` on create exists because images upload on a *separate* call, keyed
on the post id: without it the server would reject a text-free post as empty a
moment before its photos arrive.

Every comment mutation returns the whole thread, so the client never patches its
own state and cannot drift out of sync.

### Performance note

A feed page needs, per post, its images, its mentioned users, its reaction tally,
the caller's own reaction and its comment count. Fetching those per post is the
N+1 that makes social feeds slow, so `blog.repo.ts` loads every child collection
ONCE per page with `= ANY($n::uuid[])` and groups in memory. Adding a new child
collection? Follow that pattern.

## Serving uploaded files

Uploads are written with `CF_R2_PUBLIC_URL` as their prefix. On this deployment
that variable is set to the R2 **S3 API endpoint**
(`https://<account>.r2.cloudflarestorage.com/<bucket>`), which serves nothing
without a SigV4 signature — put it straight into an `<img src>` and the browser
gets a 403 and paints a broken-image icon.

So `services/fileUrls.ts` signs every stored URL when serving it, the same way
employee documents already do. Blog images and circulation attachments both go
through it, in the service layer, so no return path can forget. Signing is a
local HMAC (no network call), URLs last 24h, and a signing failure falls back to
the raw URL — a broken image beats a broken feed.

URLs that are already public (`*.r2.dev`, a custom domain) are passed through
untouched. If the bucket is later given public access, or a custom domain is put
in front of it, point `CF_R2_PUBLIC_URL` at that and the signing step becomes a
no-op on its own.
