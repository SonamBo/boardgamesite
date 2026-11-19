"""Builds the reminder email templates in emails/ for pasting into Brevo (see docs/CRM.md).
Brevo fills in {{ contact.X }} from the attributes tools/crm-sync.mjs keeps up to date."""
from pathlib import Path

IMG = 'https://boardgamesite.com/assets/img/email/'
NAME = '{{ contact.FIRSTNAME|default:"there" }}'

def page(title, fox, heading, body, button, url, extra=''):
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title}</title></head>
<body style="margin:0;padding:0;background:#FBF3E6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF3E6;">
<tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:18px;font-family:Nunito,Segoe UI,Helvetica,Arial,sans-serif;color:#3B2A22;">
<tr><td align="center" style="padding:26px 26px 0;">
<a href="https://boardgamesite.com/" style="color:#3B2A22;text-decoration:none;font-weight:800;font-size:18px;">BoardGameSite</a>
</td></tr>
<tr><td align="center" style="padding:14px 26px 0;"><img src="{IMG}{fox}.png" width="140" height="140" alt="" style="display:block;border:0;"></td></tr>
<tr><td style="padding:10px 30px 0;text-align:center;">
<h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;color:#3B2A22;">{heading}</h1>
<p style="margin:0 0 6px;font-size:16px;line-height:1.55;color:#6B5548;">{body}</p>
{extra}
</td></tr>
<tr><td align="center" style="padding:20px 26px 30px;">
<a href="{url}" style="display:inline-block;background:#EE6B1F;color:#FFFFFF;text-decoration:none;font-weight:800;font-size:17px;padding:14px 28px;border-radius:14px;">{button}</a>
</td></tr>
</table>
<p style="max-width:520px;margin:16px auto 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#9A877A;text-align:center;">
You’re getting this because you asked for reminders on BoardGameSite.
<a href="{{{{ unsubscribe }}}}" style="color:#9A877A;">Unsubscribe</a> or switch them off on your <a href="https://boardgamesite.com/account" style="color:#9A877A;">account page</a>.
</p>
</td></tr></table>
</body></html>
'''

UTM = '?utm_source=brevo&utm_medium=email&utm_campaign='
T = {
 'streak-at-risk': ('Subject: Your {{ contact.STREAK }}-day streak ends tonight',
   page('Your streak ends tonight', 'fox-flame', f'Keep your {{{{ contact.STREAK }}}}-day streak alive, {NAME}!',
        'One lesson, one daily challenge or one rated game today is all it takes. Miss today and the streak starts again from zero.',
        'Play today’s challenge', 'https://boardgamesite.com/daily' + UTM + 'streak')),
 'lesson-waiting': ('Subject: Your next {{ contact.COURSE }} lesson is ready',
   page('Your next lesson', 'fox-study', f'Pick up {{{{ contact.COURSE }}}} where you left off',
        f'Hi {NAME}, your next lesson is waiting: <b>{{{{ contact.NEXT_LESSON }}}}</b>. It takes about two minutes.',
        'Start the lesson', '{{ contact.NEXT_LESSON_URL }}' + UTM + 'lesson')),
 'we-miss-you': ('Subject: New on BoardGameSite: games, courses and daily challenges',
   page('What’s new', 'fox-wave', f'It’s been a while, {NAME}!',
        'Since your last visit we’ve added new learning courses, new games and three fresh challenges every day. Come and see.',
        'See what’s new', 'https://boardgamesite.com/' + UTM + 'winback',
        extra=f'<p style="margin:10px 0 0;font-size:15px;line-height:1.5;color:#6B5548;">Or jump straight back into <a href="{{{{ contact.FAV_GAME_URL }}}}{UTM}winback-fav" style="color:#EE6B1F;font-weight:700;">{{{{ contact.FAV_GAME|default:"your favourite game" }}}}</a>.</p>')),
 'welcome': ('Subject: Welcome to BoardGameSite, {{ contact.FIRSTNAME }}',
   page('Welcome', 'fox-trophy', f'Welcome aboard, {NAME}!',
        'Your wins, streaks and lessons are now saved to your account. Here’s a good place to start: a two-minute lesson in any of our 25 courses.',
        'Choose a course', 'https://boardgamesite.com/learn' + UTM + 'welcome')),
}
out = Path(__file__).resolve().parent.parent / 'emails'
out.mkdir(exist_ok=True)
for name, (subject, html) in T.items():
    (out / f'{name}.html').write_text(f'<!-- {subject} -->\n' + html, encoding='utf-8')
    print('wrote emails/' + name + '.html')
