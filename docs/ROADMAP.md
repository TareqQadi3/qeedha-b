# خارطة الطريق (Roadmap)

> **مُحدَّث نهائيًا في Milestone 10 (الإصدار الإنتاجي النهائي)**. الجدول
> أدناه كان لا يزال يعكس التخطيط الأولي من نهاية Phase 1 (يصف كل شيء بعدها
> بـ"لم تبدأ")، رغم أن كل مرحلة فيه اكتملت فعليًا منذ ذلك الحين. هذا هو
> السجل الفعلي والنهائي لكل ما بُني، بالترتيب الزمني الحقيقي (الأسماء
> تحوّلت من "مرحلة" إلى "Milestone" في منتصف الطريق - كلاهما يعني نفس
> الشيء: تسليم مكتمل ومُختبَر).

| # | التسليم | المحتوى | الحالة |
|---|---|---|---|
| Phase 1 | الأساس | Architecture, Domain Model (لاحقًا أُعيد بناؤه حول Membership)، Database، Auth، Multi-tenancy، RBAC، Audit Log، Integration Layer skeleton | ✅ مكتمل |
| Phase 2 | الكتالوج والمخزون | Products, Inventory, Customers, Suppliers | ✅ مكتمل |
| Phase 2.1 | تصليب نطاق الفروع/المستودعات | Branch/Warehouse Authorization Scope, IDOR hardening | ✅ مكتمل |
| Phase 3 | العمليات اليومية | POS, Sales, Payments, Invoices | ✅ مكتمل |
| Phase 4 | المحاسبة والمشتريات | Purchases, Expenses, Accounting (Double-Entry) الأساسي | ✅ مكتمل |
| Milestone 1 | إكمال المحاسبة | التقارير المالية (Trial Balance/GL/P&L/Balance Sheet)، الذمم، الأرصدة الافتتاحية، الفترات المحاسبية | ✅ مكتمل |
| Milestone 2 | تصليب الإنتاج + بيئة Demo/Staging | Security hardening (CORS/Rate limiting/Logging)، Docker، CI، Playwright مُلتزَمة | ✅ مكتمل |
| Milestone 3 | الاستيراد | Excel Import Wizard + File Storage abstraction | ✅ مكتمل |
| Milestone 4 | الامتثال الضريبي (Phase 1) | ZATCA Phase 1 - رمز QR (TLV) على كل فاتورة | ✅ مكتمل (Phase 2 مؤجَّل عمدًا، راجع أدناه) |
| Milestone 5 | تحقق إكمال المحاسبة | مراجعة/اختبارات إضافية لتقارير Milestone 1 | ✅ مكتمل |
| Milestone 6 | تقييم المخزون | متوسط التكلفة المُرجَّح (Weighted Average) + COGS مُشتقّ خادميًا | ✅ مكتمل |
| Milestone 7 | عمليات التاجر الكاملة | بيع آجل/AR، دفعات موردين/AP، مرتجعات مبيعات/مشتريات، تسوية بنكية | ✅ مكتمل |
| Milestone 8 | SaaS / الاشتراك والفوترة | خطط، اشتراك، فترة تجريبية، صلاحيات ميزات، حدود استخدام | ✅ مكتمل |
| Milestone 9 | تكامل قيّدها | اتجاه Inbound فعلي (ربط، مصادقة خارجية، تسوية معاملات) | ✅ مكتمل |
| Milestone 10 | الإصدار الإنتاجي النهائي | تدقيق إنتاجي شامل، تصليب أمني، توثيق نهائي، Release checklist | ✅ مكتمل — **هذا آخر Milestone في خارطة الطريق المتفق عليها** |

## لا Milestone بعد Milestone 10

خارطة الطريق المتفق عليها **مُغلَقة عند Milestone 10**. لا Milestone 11 أو
أي تسليم إضافي مخطَّط له. أي عمل مستقبلي (Control Center، Website،
Affiliate، ZATCA Phase 2، تطبيق موبايل أصلي، تكامل تمويل خارجي، تحليلات
متقدمة، عملات متعددة، ...) يتطلب قرار نطاق جديد صريح من خارج هذه الخارطة —
راجع `docs/PROJECT_STATUS.md` §"Milestone 10" §"نطاق مستقبلي/خارجي".

## ملاحظات معمارية محفوظة من التخطيط الأولي (لا تزال صحيحة)

- **Integration Layer**: البنية العامة (Interfaces، جداول، Registry)
  بُنيت في Phase 1 كجزء من الأساس المعماري. الـAdapter الفعلي الـ**Outbound**
  لقيّدها (Qeedha B تستدعي قيّدها) لا يزال غير مُنفَّذ — **BLOCKED BY
  EXTERNAL DEPENDENCY** (ينتظر عقد API رسمي من قيّدها لا يملكه هذا
  المستودع). بدلًا من ذلك، Milestone 9 بنى اتجاه **Inbound** (قيّدها
  تستدعي Qeedها B) عبر عقد يملكه هذا المستودع نفسه — راجع
  `docs/QEEDHA_INTEGRATION.md`.
- **ZATCA**: قرار الـappend-only على الفواتير كان جاهزًا منذ Phase 3.
  Phase 1 (QR) اكتمل في Milestone 4. Phase 2 (XML/UBL، التوقيع الرقمي،
  CSID، الإرسال الفعلي) لا يزال غير مُنفَّذ عمدًا — **BLOCKED BY EXTERNAL
  DEPENDENCY** (اعتمادات ZATCA حقيقية وقرار عمل/قانوني حول الموجة
  المطبَّقة غير متاحين).
- **Offline POS**: دراسة أولية ضمن Phase 3، لكن التفصيل الكامل (Local DB،
  Conflict resolution) **لم يُبنَ** ولن يُبنى ضمن خارطة الطريق هذه —
  **KNOWN LIMITATION** موثَّقة صراحةً، وليست نسيانًا (`docs/POS.md`).
