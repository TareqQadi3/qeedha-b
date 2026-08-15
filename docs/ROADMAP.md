# خارطة الطريق (Roadmap)

القاعدة: لا تُبنى مرحلة جديدة قبل اختبار المرحلة السابقة (`TESTING.md`) وتحديث
`PROJECT_STATUS.md`.

| # | المرحلة | المحتوى | الحالة |
|---|---|---|---|
| 1 | الأساس | Architecture, Domain Model, Database, Auth, Multi-tenancy, RBAC, Audit Log, Integration Layer skeleton | 🟡 قيد التنفيذ (هذا التسليم) |
| 2 | الكتالوج والمخزون | Products, Inventory, Customers, Suppliers | ⬜ لم تبدأ |
| 3 | العمليات اليومية | POS, Sales, Purchasing, Expenses | ⬜ لم تبدأ |
| 4 | المحاسبة والتقارير | Accounting (Double-Entry), Reports, Dashboard | ⬜ لم تبدأ |
| 5 | الاستيراد | Excel Import Wizard | ⬜ لم تبدأ |
| 6 | الامتثال الضريبي | ZATCA (Phase 1 ثم تقييم Phase 2 حسب الموجة) | ⬜ لم تبدأ |
| 7 | التكامل | Integration Layer الفعلي + Qeedha Adapter (يحتاج API Contract منك) | ⬜ لم تبدأ |
| 8 | التصليب النهائي | Testing شامل، Security Hardening، UX Polish، Offline POS تفصيليًا | ⬜ لم تبدأ |

## ملاحظات على الترتيب

- **Integration Layer**: البنية العامة (Interfaces، جداول، شاشة الإعدادات
  الفارغة) تُبنى في **المرحلة 1** لأنها جزء من الأساس المعماري. أما الـAdapter
  الفعلي لقيّدها فينتظر المرحلة 7 وتوفر عقد API رسمي منك.
- **ZATCA**: قرار append-only على جدول الفواتير يجب أن يكون جاهزًا من المرحلة
  3 (أول فاتورة تُصدَر)، حتى لو التنفيذ الكامل للامتثال في المرحلة 6.
- **Offline POS**: دراسة أولية ضمن المرحلة 3، التفاصيل الكاملة (Local DB،
  Conflict resolution) قد تمتد لتفصيل إضافي ضمن المرحلة 8.
- كل مرحلة تنتهي بـ: كود يعمل + اختبارات خضراء + تحديث `PROJECT_STATUS.md` +
  `CHANGELOG.md` + إذن صريح منك للانتقال للتالية.
