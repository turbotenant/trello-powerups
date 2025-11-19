# notes

Act as a senior QA engineer.

From the current code changes, generate concise manual QA test notes in Markdown using this format:

## 🧪 QA Test Notes – [Feature or PR Name]

**What Changed**
- Bullet list of key behavior changes in plain language

**Files Modified**
- file/path.ts – short description of what changed
- ...

---

🎯 **Test Areas**
For each affected area:
- Location/URL:
- Trigger:
- Expected behavior:
- Event tracking (if any):

---

✅ **Test Checklist**
**Happy Path**
□ Step-by-step instructions
□ Expected result for each step

**Edge Cases & Errors**
□ Edge cases and unusual user flows
□ Error states and validations
□ Mobile/responsive (if relevant)
□ Permissions/roles (if relevant)

---

🔍 **Technical Details**
- API changes (endpoints, methods, payloads)
- Database/Sequelize changes (tables, columns, migrations)
- Feature flags / config dependencies
- Event names + properties to verify

---

📊 **Behavior Change & Regression Risks**
- How behavior differs from before
- Nearby flows or features that might regress

---

Rules:
- Base everything only on the actual code changes; do not invent features or tests.
- Mention concrete UI labels, URLs, and entities when visible in the diff.
- If a requirement or expected behavior isn’t clear, add a “Question for dev/PM” bullet.
- Keep it concise but complete enough to paste directly into Trello.
Generate the notes now.

