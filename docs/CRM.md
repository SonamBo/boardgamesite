# Reminder emails (CRM)

Signed-in players who opt in get short emails that bring them back: a streak about to end, the next
lesson in their course, and a "what's new" note after two weeks away. Brevo sends them; the site and a
nightly GitHub job keep Brevo up to date.

## How it fits together

1. **Opt-in.** The sign-up box "Email me streak reminders and new games" (ticked by default; players can untick it) and the
   *Emails* switch on /account save `emails.reminders` on the player's Firestore profile
   (`users/{uid}`). Signed-in visits also stamp `lastSeen` once a day.
2. **Nightly sync.** `.github/workflows/crm-sync.yml` runs `tools/crm-sync.mjs` every day at 17:47 IST.
   It reads opted-in players with a confirmed email and creates or updates them as Brevo contacts in one
   list, with these attributes:

   | Attribute | Meaning |
   |---|---|
   | FIRSTNAME | the name they play under |
   | LAST_VISIT, DAYS_AWAY | last signed-in visit and whole days since |
   | STREAK, STREAK_AT_RISK | current streak; true if they had one but haven't played today |
   | XP, LESSONS_DONE | learning progress |
   | COURSE, NEXT_LESSON, NEXT_LESSON_URL | the course in progress and its next lesson |
   | FAV_GAME, FAV_GAME_URL | most-played game |

   Anyone who switched reminders off, deleted their account or never confirmed their email is taken off
   the list. The job logs counts only, never names or emails.
3. **Automations in Brevo** send the emails from the templates in `emails/` (rebuild them with
   `python3 tools/make-emails.py`).

## One-time setup

1. **Brevo:** sign up (free plan), then *Senders, Domains & Dedicated IPs*: add and authenticate
   `boardgamesite.com` (Brevo shows DNS records to add in GoDaddy) and add a sender such as
   `hello@boardgamesite.com`.
2. **List:** *Contacts → Lists → Create a list* called "Reminders". Note its ID (the number in the list's URL).
3. **API key:** *SMTP & API → API Keys → Generate a new API key*.
4. **GitHub** (repo *Settings → Secrets and variables → Actions*):
   - secret `BREVO_API_KEY` = the API key
   - variable `BREVO_LIST_ID` = the list ID
   - `FIREBASE_SERVICE_ACCOUNT` already exists (used for deploys). Give that service account two more
     roles in Google Cloud IAM: **Cloud Datastore Viewer** and **Firebase Authentication Viewer**.
5. **First run:** *Actions → Sync players to Brevo → Run workflow*, first with "Only count players"
   ticked, then without. The attributes appear in Brevo after the first real run.
6. **Templates:** *Campaigns → Templates → New template → Paste your code* for each file in `emails/`
   (the subject is in the comment on the first line).
7. **Automations** (*Automations → Create an automation → Custom*). Entry: contact in list "Reminders".

   | Automation | Trigger | Condition | Email |
   |---|---|---|---|
   | Streak saver | Contact attribute updated: STREAK_AT_RISK | STREAK_AT_RISK is true and STREAK ≥ 3 | streak-at-risk |
   | Lesson waiting | Contact attribute updated: DAYS_AWAY | DAYS_AWAY equals 3 and NEXT_LESSON is not empty | lesson-waiting |
   | We miss you | Contact attribute updated: DAYS_AWAY | DAYS_AWAY equals 14 | we-miss-you |
   | Welcome | Contact added to list "Reminders" | | welcome |

   Allow each contact to re-enter each automation, but no more than once every 7 days, so nobody gets
   more than a few emails a week.

## Privacy

The sign-up box is ticked by default (players can untick it); every email has Brevo's unsubscribe link plus the account-page switch;
the privacy policy names Brevo. Deleting an account removes the player from the list on the next run.
