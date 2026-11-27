# Draughtie Trivia

Offline trivia for when your beer comes in a can. Works as an installable app on your Pixel.

## Put it on your phone (one-time setup)

You need a free GitHub account. The app has to live at an https link once, so Chrome can install it and save it for offline use.

1. On github.com, create a new **public** repository (name it e.g. `draughtie-trivia`).
2. Unzip this folder on your computer. In the repo, choose **Add file > Upload files** and drag in **everything inside the folder** (index.html, app.js, sw.js, style.css, manifest.webmanifest, questions.json, the `icons` folder). Click **Commit changes**.
3. Go to **Settings > Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, pick **main** and **/ (root)**, then Save.
4. After a minute or two the page shows your link: `https://YOUR-USERNAME.github.io/draughtie-trivia/`
5. On your Pixel, open that link in **Chrome** (needs signal this one time). You should see "Saved for offline use."
6. Chrome menu (three dots) > **Install app** (or **Add to Home screen**). It now appears in your app drawer with the bottle icon.
7. Test it: turn on airplane mode and open Draughtie Trivia from the icon.

## Using the app

- Every **New question** automatically adds one beer to your tally (total and today). **Undo beer** removes the last one if you need to correct it.
- **New question**, then **Reveal answer**, then **Got it** or **Missed it**. Your score is the percentage you got right.
- Each question is only asked once until you run out. When the last one is answered you get an "all done" prompt with a **Start over** button.
- If you tap the wrong one, use **Wrong tap? Mark as missed/right**.

## Adding your questions

Your questions go in `questions.json`. Format:

```json
[
  { "id": 1, "question": "Which city hosted the 2024 Olympic Games?", "answer": "Paris" },
  { "id": 2, "question": "Your next question", "answer": "Its answer" }
]
```

- Give every question a **unique id**. Your seen list is tracked by id, so keep ids the same once a question has been used.
- **Option A, edit on GitHub:** open `questions.json` in your repo, click the pencil, paste your questions, commit. Open the app while you have signal and it picks up the new list (give it a second, then reopen if needed).
- **Option B, import on the phone:** menu > **Import questions**, pick a JSON file in the same format. Imported questions are stored on the phone and merged with the built-in ones. Importing the same file again updates rather than duplicates.

## Backup

Menu > **Export backup** saves a JSON file (seen questions, beers, score, imported questions) to Downloads. **Restore backup** puts it back. Do this occasionally, because clearing Chrome's site data wipes the app's saved progress.

## Notes

- Everything is stored on your phone in the browser's storage. Nothing is sent anywhere.
- If you ever edit the code files (not just questions.json), change `CACHE` in `sw.js` (e.g. `draughtie-trivia-v5`) so phones pick up the update.
- The "all questions answered" alert shows inside the app. It isn't a system notification.
