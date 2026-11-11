# GuidEd v2.0: new look (from the Teaching Studio mockup)

Branch: `v2.0` (cut from `fix/sign-in-registration` at the point the mockup was shared). Production keeps building from `fix/sign-in-registration` until v2.0 is merged; Vercel gives this branch its own preview URL.

## What the mockup shows
- **Studio home:** a "Teaching Studio" header with the line "Everything you need to teach with confidence", then **What would you like to do?** with three big action cards: **Lesson Plan** (Plan a lesson), **Resources** (Create materials), **Find Media** (Images and videos). The chosen card turns solid blue.
- **One form per action**, all starting from the same context: Teaching topic, Class, Subject, Curriculum indicator (marked "Required context").
  - Lesson Plan: Lesson duration (40, 60 or 80 min) and a black **Create Lesson Plan** button.
  - Resources: **Choose a learning resource** as a 2-column grid of cards (Study Notes, Learner Worksheets, Homework Pack, BECE Practice, Teaching Slides), each with an icon, one-line description and "Create".
  - Find Media: Videos / Images / Both selector, optional search topic, a "curriculum-aware search" note and a black **Find Videos** button.
- **Your teaching toolkit:** My Teaching Library (previously created materials) and My Teaching Schedule (keep teaching organised), plus a "A little teaching inspiration" tip card.
- **Bottom tab bar on phones:** Studio, Lesson Plan, Resources, Find Media.
- **Look:** soft off-white page, white rounded cards (about 24 px radius), deep navy text, a strong royal blue for the selected state, pale-blue info boxes, pill inputs and selects, a black pill primary button, small green and blue status chips, line icons.

## How it maps to what exists today
| Mockup | Today | Plan for v2.0 |
|---|---|---|
| Studio home with 3 action cards | Teaching Studio panel under the chat | Make Studio the home screen; chat and the plan view open from it |
| Lesson Plan form | Class, subject, week, options in the composer | One form: topic, class, subject, indicator (from the scheme), duration |
| Resources grid | Resource dropdown in Studio | Card grid, one card per resource type |
| Find Media | Images search (video is "Coming soon") | Same tab with Videos, Images, Both |
| My Teaching Library | Sidebar class folders | A Library screen reusing the same saved plans |
| My Teaching Schedule | Term planner and term runs | A Schedule screen built on the schemes |
| Bottom tab bar | Hamburger sidebar | Tab bar on phones; sidebar stays on desktop |

## Keep as they are
GuidEd name and green and gold brand until decided otherwise, sign-in and plans (Free and Pro), exports (Word, PDF, share), the signature and stamp area, the slide deck, the service-worker update bar.

## Suggested order of work
1. Design tokens and base styles (colours, radius, type, buttons, chips).
2. Studio home and the three action cards.
3. The three forms on the shared context.
4. Bottom tab bar on phones.
5. Library and Schedule screens.
6. Polish, dark mode, tests, then merge.
