# Payroll 2.0 — Business & Functional Manual

**Module:** Payroll 2.0 (Zithspace)
**Audience:** Payroll & HR administrators, finance, compliance, and product teams
**Nature:** Business / functional documentation — what each page is, why it exists, every field explained, and how the flow works. (Non-technical.)

---

## Table of Contents

**Part A — Settings & Configuration**
1. General Settings
2. Salary Components
3. Salary Structures
4. Pay Schedules & Pay Groups
5. Statutory (Provident Fund & ESI)
6. Professional Tax & LWF
7. Approval Workflows
8. Payslip & Bank Settings

**Part B — Employee Pay Setup**
9. Employee Pay Setup (Assigning a Salary)
10. Statutory & Bank IDs *(drawer within Employee Pay Setup)*
11. Compensation History *(drawer within Employee Pay Setup)*

**Part C — Running Payroll**
12. Run Payroll (Create & Compute)
13. Approving, Finalising & Paying a Run
14. Payslips & Bank File (Generating the Outputs)

**Part D — Employee & Reporting**
15. My Payslips (Employee Self-Service)
16. Reports (Salary Register & Statutory Summary)

---

## Module Overview

Payroll 2.0 takes a company from *defining how pay works* all the way to *paying employees and reporting it* — in one connected flow. It is organised in four layers:

- **Settings & Configuration** — the company-wide rule book: financial year and rounding, the library of pay components, salary grades, pay calendars, statutory rules (PF/ESI/PT/LWF), approval chains, and payslip/bank formats.
- **Employee Pay Setup** — applying those rules to real people: assigning each employee a salary grade at their CTC (which freezes their agreed breakdown), capturing their statutory and bank details, and keeping a history of every revision.
- **Running Payroll** — the monthly act: create a run, compute every salary, apply loss-of-pay, route it through approval, lock it, pay it, and produce payslips and the bank file.
- **Employee & Reporting** — employees self-serve their payslips; finance and compliance pull the salary register and statutory summaries.

Each layer feeds the next. Settings are inherited by structures; structures are applied to employees; employee setups are computed in runs; runs produce documents and reports.

---

## End-to-End Flow (in words)

```
CONFIGURE                         SET UP PEOPLE                 RUN EACH MONTH                         DELIVER
─────────                         ─────────────                ──────────────                        ────────
General Settings  ┐                                            Create Pay Run                         Generate Payslips ┐
Salary Components ┤                Assign Salary  ┐             (seeds every assigned employee         Generate Bank File┤
Salary Structures ┤── feed ──▶     (freezes a     ├── feed ─▶   from their frozen breakdown)           (from finalised   ┤
Schedules & Groups┤   structures   breakdown)     │            → Apply LOP (manual / sync leaves)      run)              │
PF · ESI · PT/LWF ┤                Statutory&Bank │            → Submit → Approve (workflow)                              │
Approval Workflows┤                IDs            │            → Finalize & Lock                       My Payslips ◀──────┘
Payslip & Bank    ┘                Comp History ◀─┘            → Mark Paid                             Reports (register +
                                                                                                       statutory totals)
```

**Narrative:** The company first **configures** its payroll rules. It then **assigns** salaries to employees (each computed from a structure and *frozen* as agreed pay) and records their statutory/bank details. Every period it **creates a pay run**, which automatically computes all salaries from those frozen breakdowns, applies loss-of-pay (entered manually or synced from approved leave), and is **reviewed**. The run is **submitted for approval**, signed off step-by-step, then **finalised and locked** so the numbers are permanent, and **marked paid** once disbursed. From the finalised run, **payslips** and the **bank file** are produced; **employees self-serve** their slips, and **finance/compliance** export the register and statutory totals.

A key principle throughout: **an employee's agreed pay is frozen at assignment** and **a run's figures are locked at finalisation** — so what's approved is exactly what's paid, reported, and shown to employees.

---
---

# Part A — Settings & Configuration

---

## Doc 01 — General Settings

**What it is:** The organisation-wide rule book for payroll — the foundational parameters every salary calculation depends on (financial year, currency, pay frequency, how a monthly salary becomes a per-day rate, how unpaid days are treated, and how amounts are rounded). Set once; governs everything thereafter.

**Why it exists:** Payroll can't calculate correctly until the business fixes these baselines. Centralising them removes ambiguity so two employees with identical salaries are always treated identically.

### Section A — Financial Year & Pay Cycle
| Field | Meaning | Default |
|---|---|---|
| Financial year starts | The month the financial/tax year begins; drives statutory periods, tax, and year-to-date. | April |
| Currency | Currency all salaries are expressed and paid in. | INR (₹) |
| Pay frequency | How often employees are paid. | Monthly (also Semi-monthly, Bi-weekly, Weekly) |
| Pay day | Day of month salaries are disbursed (31 = last day). | 1st |

### Section B — Salary Calculation Basis
How a monthly salary becomes a per-day rate (used for proration on absence/join/exit).
| Option | Meaning | Example (₹30,000) |
|---|---|---|
| Calendar days | Divide by actual days in the month (28–31). | 30-day month → ₹1,000/day |
| Fixed days | Always divide by a fixed number. | ÷30 → ₹1,000/day even in Feb |
| Working days | Divide by working days only (excl. weekly-offs/holidays). | ÷22 → ~₹1,364/day |
| Fixed days per month | The constant denominator (shown for Fixed days). | 30 |

> *Example:* a 1-day unpaid absence in February (28 days) deducts ₹1,071 (calendar) vs ₹1,000 (fixed-30) — which is why this is a company-wide policy.

### Section C — Loss of Pay (LOP)
| Field | Meaning |
|---|---|
| Enable Loss of Pay | Whether unpaid days are deducted at all. |
| LOP per-day basis | Calendar / Fixed / Working — basis used specifically for LOP. |
| LOP fixed days per month | Constant denominator for LOP (shown for Fixed days). |

### Section D — Rounding & Display
| Field | Meaning | Example |
|---|---|---|
| Net pay rounding | None / Nearest / Up / Down. | — |
| Round to nearest | Unit to round to. | 1 = whole rupee |
| Decimal places | Decimals shown. | 2 |

**Flow:** Pre-filled with India defaults on first visit → adjust to policy → Save (active only when edited) → applies to every future run.

**One-line:** *General Settings is the company-wide payroll rule book — financial year, currency, pay cycle, per-day basis, LOP treatment, and rounding — so every salary is calculated consistently and correctly.*

---

## Doc 02 — Salary Components

**What it is:** The reusable library of pay building blocks — each a named line (Basic, HRA, PF, Professional Tax, Fuel Reimbursement) defined once with its rules, then reused across structures and employees.

**Why it exists:** A salary is a breakdown of many elements, each carrying rules (taxable? attracts PF? prorates?). Defining each once standardises behaviour, enables reuse, and keeps compliance accurate.

### Step 1 — Basic Details
| Field | Meaning |
|---|---|
| Component name | Readable label (with India suggestions that prefill defaults). |
| Code | Unique identifier, auto-derived from name; locked after creation. |
| Category | Earning (adds to gross) / Deduction (subtracts) / Reimbursement (paid back) / Benefit (employer cost). |
| Description | Optional note. |

### Step 2 — Calculation
| Field | Meaning | Example |
|---|---|---|
| Type | Fixed amount or Percentage. | — |
| Default amount / Percentage | Starting value (structures can override). | 40 (%) or 15000 |
| Percentage of | Base for % components: Basic / Gross / CTC. | 50% of Basic |
| Display order | Order on the payslip (lower first). | Basic=1 |

### Step 3 — Tax, Statutory & Visibility (toggles)
| Toggle | Meaning |
|---|---|
| Taxable | Counts toward taxable income (drives TDS). |
| Pro-rata | Shrinks for partial months / unpaid days. |
| Part of CTC | Included in cost-to-company. |
| Consider for PF | Included in PF wage base. |
| Consider for ESI | Included in ESI wage base. |
| Show on payslip | Visible to the employee. |
| Active | Available for new structures. |

**One-line:** *Salary Components is the reusable library of pay elements — earnings, deductions, reimbursements, benefits — each defined once with its calculation and tax/statutory rules, so they combine consistently into structures and compute accurately in runs.*

---

## Doc 03 — Salary Structures

**What it is:** Reusable salary templates (grades). A structure composes components into a complete breakdown using percentage rules — e.g., *Grade A: Basic 40% of CTC, HRA 50% of Basic, Special Allowance balances, PF 12% of Basic*.

**Why it exists:** Defining a breakdown per employee would be slow and inconsistent. Structures standardise pay design per grade, automate the maths at any salary level, and guarantee earnings reconcile to gross.

### Part A — Structure Details (header)
| Field | Meaning |
|---|---|
| Structure name | Grade/template label. |
| Code | Unique identifier. |
| Reference monthly gross | A sample figure used **only to preview/balance** the template — not an employee's real pay. |
| Active | Available to assign. |
| Description | Optional note. |

### Part B — Component Lines
| Per-line field | Meaning |
|---|---|
| Component | A component from the library (shows name + category). |
| Calculation type | Fixed or Percentage — for this grade. |
| Of (base) | Basic / Gross / CTC (for % lines). |
| Value | Fixed amount or percentage. |
| Computed amount | Live preview against the reference gross. |

**Auto-balancing:** Basic is computed first; **Special Allowance absorbs the remainder** so earnings always equal gross — no manual tweaking. *Example at ₹50,000:* Basic ₹20,000 + HRA ₹10,000 + Special ₹20,000 = Gross ₹50,000; PF ₹2,400; Net ₹47,600. If fixed parts exceed gross or there's no Special Allowance, an **Unbalanced** warning appears.

**Live totals:** Gross, Deductions, Net, CTC + a Balanced/Unbalanced badge update as you build.

**Frozen on use:** assigning a structure freezes the breakdown — later template edits do **not** change already-assigned employees.

**One-line:** *Salary Structures are reusable grade templates that compose components into a balanced breakdown via percentage rules and an auto-balancing Special Allowance, so a complete salary is generated for any employee by applying the grade at their CTC.*

---

## Doc 04 — Pay Schedules & Pay Groups

**What it is:** Defines *when* payroll runs and *who* runs together. **Pay Schedules** are the payroll calendars (frequency, cycle dates, pay day). **Pay Groups** bundle employees onto one schedule and one legal entity.

**Why it exists:** Companies pay different populations differently (staff monthly, contractors fortnightly; different legal entities, pay dates). This models real pay cycles, separates populations, scopes runs, and holds one official default calendar.

### Pay Schedules
| Field | Meaning | Example |
|---|---|---|
| Schedule name / Code | Label + identifier. | Monthly — India / MON_IN |
| Frequency | Monthly / Semi-monthly / Bi-weekly / Weekly. | Monthly |
| Cycle start / end day | The pay period range (31 = last day). | 1 – 31 |
| Pay day | Day salaries are disbursed. | 1st |
| Pay in next month | Pay day falls after the work period (work June, pay 1 July). | On |
| Default schedule | The company's primary calendar (only one). | On |
| Active / Description | Availability + note. | — |

### Pay Groups
| Field | Meaning | Example |
|---|---|---|
| Group name / Code | Label + identifier. | India Full-time / IND_FT |
| Pay schedule | The calendar this group runs on. | Monthly — India |
| Legal entity | The company/entity employees are paid under. | Acme India Pvt Ltd |
| Active / Description | Availability + note. | — |

**Relationship:** one schedule → many groups; one group → one schedule + one legal entity. A schedule used by groups is protected from deletion.

**One-line:** *Pay Schedules & Pay Groups define payroll's timing and grouping — schedules are the pay calendars, groups bundle employees onto a schedule and legal entity — so every run knows who is paid, for which period, on which day, under which company.*

---

## Doc 05 — Statutory (Provident Fund & ESI)

**What it is:** Configures India's two core statutory contributions — **Provident Fund (PF/EPF)** (retirement savings) and **Employee State Insurance (ESI)** (health insurance for lower-wage employees). Pre-filled with prevailing statutory defaults.

**Why it exists:** PF and ESI are legally mandated and audited. Centralising rates, ceilings, and rules keeps deductions, employer liabilities, and returns accurate and current.

### Tab A — Provident Fund
| Field | Meaning | Default |
|---|---|---|
| Enable PF | Master switch. | On |
| Employee / Employer contribution (%) | Shares of PF wages. | 12% / 12% |
| Wage ceiling | Statutory cap on PF wages. | ₹15,000 |
| Restrict to wage ceiling | Cap PF at the ceiling vs compute on actual wages. | On |
| Include employer PF in CTC | Count employer share in CTC. | On |
| Establishment / LIN code | PF registration number for returns. | — |
| EPS + rate | Part of employer share diverting to pension. | On / 8.33% |
| EDLI + rate | Insurance contribution (employer-borne). | On / 0.5% |
| EPF admin charges (%) | Admin charge on PF wages. | 0.5% |

*Live example on ₹20,000:* PF wage ₹15,000 (capped), Employee PF ₹1,800, EPS ₹1,250 — recalculating as rates change.

### Tab B — Employee State Insurance
| Field | Meaning | Default |
|---|---|---|
| Enable ESI | Master switch. | On |
| Employee / Employer contribution (%) | Shares of gross wages. | 0.75% / 3.25% |
| Wage threshold | Eligibility ceiling — at/under = covered. | ₹21,000 |
| Establishment code | ESI registration number. | — |

*Live example:* ₹20,000 → Eligible; Employee ESI ₹150, Employer ESI ₹650. ₹22,000 → Not eligible.

**One-line:** *Statutory (PF & ESI) holds India's mandatory contribution rules — PF rates, ₹15,000 ceiling, EPS/EDLI/admin charges, and ESI rates with the ₹21,000 threshold — pre-filled and previewed live, so every run computes contributions compliantly.*

---

## Doc 06 — Professional Tax & LWF

**What it is:** Configures India's **state-level** statutory deductions — **Professional Tax (PT)** (a salary-band tax that varies by state) and **Labour Welfare Fund (LWF)** (small fixed employee/employer contributions at a state-defined frequency). Configured per state.

**Why it exists:** Multi-state employers face different rules in each state — there's no national rate. This captures each state's rules and applies the right deduction to the right employee.

### Tab A — Professional Tax (state + slabs)
**State header:** State, Active.
**Slab rows** (the band table):
| Field | Meaning | Example (Karnataka) |
|---|---|---|
| From (₹) | Lower bound of the salary band. | 0 / 25,000 |
| To (₹) | Upper bound (blank = "and above"). | 24,999 / *(above)* |
| PT / month (₹) | Fixed PT for that band. | ₹0 / ₹200 |

*Example:* ₹30,000/month in Karnataka → "₹25,000 and above" band → ₹200 PT.

### Tab B — LWF (per state)
| Field | Meaning | Example |
|---|---|---|
| State | Which state. | Karnataka |
| Employee / Employer amount (₹) | Fixed contributions. | ₹20 / ₹40 |
| Frequency | Monthly / Half-yearly / Yearly. | Half-yearly |
| Active | In force. | On |

The state dropdown excludes already-configured states to prevent duplicates.

**One-line:** *Professional Tax & LWF capture India's state-level deductions — PT as salary-band slabs and LWF as small fixed contributions at a state frequency — configured per state so a multi-state employer deducts and remits correctly everywhere it operates.*

---

## Doc 07 — Approval Workflows

**What it is:** Defines the ordered sign-off chains a pay run must pass before it can be finalised. A workflow is a list of approval steps, each naming who approves.

**Why it exists:** Payroll is high-value; releasing it uncontrolled is a risk. Workflows enforce accountability, mirror company governance, create an audit trail, and let approvers reject flawed runs before they're locked.

### Part A — Workflow Details
| Field | Meaning |
|---|---|
| Workflow name / Description | Label + note. |
| Default workflow | The chain runs use automatically (only one). |
| Active | Available for use. |

### Part B — Approval Steps (ordered)
| Approver type | Meaning |
|---|---|
| Reporting Manager | The employee's line manager approves. |
| Anyone with Role | Anyone holding a chosen role approves. |
| Specific User | One named person approves. |

Per-step: a **role/user selector** (conditional), an optional **fallback approver**, **reorder ↑↓**, and **remove**.

**How a run uses it:** Submit → sits at Step 1 (Pending Approval) → each step approves → final step → Approved. Any step can **Reject** (with a required reason) → back to Draft. Every action is logged.

**One-line:** *Approval Workflows define the ordered sign-off chains payroll runs must pass — each step naming an approver (manager, role, or specific person, with a fallback) — so every run is reviewed, fully audited, and never released without authorisation.*

---

## Doc 08 — Payslip & Bank Settings

**What it is:** Controls payroll's outputs — the **Payslip Template** (how the slip looks and what it shows) and **Bank & Disbursement** (the paying account, payment mode, and bank file format).

**Why it exists:** Payslips and bank files must be correct, consistent, and bank-acceptable. This standardises appearance, controls disclosure, defines the paying account, and matches the bank's required format.

### Tab A — Payslip Template
**Branding:** Accent colour, Show company logo, Net pay in words, Footer note.
**Fields & Sections (toggles):** PAN, UAN, PF number, ESI number, Bank account, Year-to-date (YTD), Leave balance, Attendance summary.

### Tab B — Bank & Disbursement
| Field | Meaning | Options |
|---|---|---|
| Bank name / Account number / IFSC | The company's salary-paying account. | — |
| Payment mode | Transfer method. | NEFT / IMPS / RTGS |
| Bank file format | Layout the bank imports. | Generic CSV / HDFC / ICICI / SBI / Axis / Kotak |

**One-line:** *Payslip & Bank Settings govern payroll's outputs — the payslip's branding and visible details, plus the disbursement account, payment mode, and bank file format — so payslips are consistent and bank files are accepted without rework.*

---
---

# Part B — Employee Pay Setup

---

## Doc 09 — Employee Pay Setup (Assigning a Salary)

**What it is:** Where configuration becomes real, personal pay — an employee is given a salary structure at their specific CTC, producing (and freezing) their exact breakdown. Shows the employee directory with each person's pay status.

**Why it exists:** A grade only pays someone once applied at their salary. This turns templates into personal pay, shows who is/isn't set up, locks in agreed pay (frozen), and handles revisions.

### The list view
Cards: Employees, Assigned, Not set up, Avg Monthly CTC. Table: employee, structure, monthly/annual CTC, status, an **IDs & Bank** ✓, and actions (Assign/Revise, IDs & Bank, History, Revoke).

### The Assign / Revise drawer
| Field | Meaning | Example |
|---|---|---|
| Salary structure | The grade to apply. | Grade A |
| Monthly CTC | The employee's real CTC (percentages compute against this). | ₹80,000 |
| Annual CTC | Auto-derived (×12). | ₹9,60,000 |
| Effective from | Date the salary takes effect. | 1 Jul 2026 |
| Notes | Reason/context. | Joining / Increment |

A **live breakdown preview** shows the exact salary (components + gross/deductions/net/CTC) before saving.

**Frozen breakdown:** on save, the structure's rules are evaluated against the CTC and **frozen** — later template edits don't change this employee. **Revise** creates a new assignment (one active at a time); **History** retains the trail; **Revoke** clears the setup.

**One-line:** *Employee Pay Setup applies a structure to an individual at their real CTC, computes and freezes their exact breakdown as agreed pay, and tracks who is set up — so every run has a correct, committed salary protected from template changes.*

---

## Doc 10 — Statutory & Bank IDs
*(A drawer within Employee Pay Setup, opened via the ID-card action on an employee's row — not a standalone page. Header subtitle: "Statutory IDs & bank account".)*

**What it is:** The per-employee record of identity, statutory, and bank details needed to pay and report them.

**Why it exists:** Payroll can compute a salary but can't pay or report without these. Enables disbursement, drives tax computation, supports compliance, and provides a readiness check.

### Section A — Statutory IDs
| Field | Meaning |
|---|---|
| PAN | Tax ID; for TDS reporting and payslips. |
| Tax regime | New or Old — affects income-tax computation. |
| UAN | Universal Account Number linking PF across employers. |
| PF number | PF account number. |
| ESI number | ESI number (where applicable). |

### Section B — Salary Bank Account
| Field | Meaning |
|---|---|
| Account holder name | Name on the account (as per bank). |
| Bank name | Employee's bank. |
| IFSC | Branch code for routing. |
| Account number | Where net salary is deposited (masked in UI). |

**Readiness:** the list shows ✓ when PAN + bank account are present (payment-ready), — when missing.

**One-line:** *Statutory & Bank IDs capture each person's compliance numbers (PAN, tax regime, UAN, PF, ESI) and salary bank account — so they can be paid via the bank file, taxed under the right regime, and reported correctly — with a readiness ✓ that prevents anyone being missed.*

---

## Doc 11 — Compensation History
*(A drawer within Employee Pay Setup, opened via the clock/History action on an assigned employee's row — not a standalone page.)*

**What it is:** The newest-first timeline of an employee's every salary assignment — how their pay has changed from joining through each revision.

**Why it exists:** Salaries change; the business needs a dated record of what changed, when, and by how much — for audit, reviews, and pay queries.

### What you see (per timeline entry)
| Element | Shows |
|---|---|
| Status dot | Green = current, grey = superseded. |
| Monthly CTC | CTC for that assignment. |
| Current / Superseded tag | Live vs historical. |
| Change (delta) | ↑/↓ vs the previous salary. |
| Structure | Grade used. |
| Effective date | When it took effect. |
| Annual CTC | Yearly figure. |
| Notes | Reason recorded at the time. |

*Example:* joined ₹50,000 (superseded) → revised ₹70,000 (current) = **↑ ₹20,000**, "Annual hike".

**Supersession, not deletion:** revisions supersede (never overwrite) — the full chain is preserved; only one is active.

**One-line:** *Compensation History is the per-employee, newest-first timeline of every salary assignment — each revision's CTC, the increase/decrease, grade, date, and reason — with past salaries preserved, giving a permanent, auditable record of how pay evolved.*

---
---

# Part C — Running Payroll

---

## Doc 12 — Run Payroll (Create & Compute)

**What it is:** Where payroll is executed each period — creating a run produces the **salary register** by pulling every assigned employee's frozen breakdown, applying loss-of-pay, and computing gross/deductions/net.

**Why it exists:** Payroll must be repeatable, reviewable, and accurate. This generates the month's salaries in one action, applies real-world LOP/proration, gives a reviewable register, tracks the lifecycle, and prevents duplicate runs.

### Creating a run
| Field | Meaning | Example |
|---|---|---|
| Month / Year | The pay period. | June 2026 |
| Notes | Optional context. | Regular monthly payroll |

On creation: finds every actively-assigned employee → pulls each frozen breakdown → computes for the month → rolls up totals → presents as **Draft**. Only one run per period (duplicate blocked).

### The salary register
Summary bar (Employees, Gross, Deductions, Net Payout) + per-employee rows:
| Column | Shows |
|---|---|
| Employee | Name + structure. |
| Monthly CTC | Agreed CTC. |
| LOP days | Unpaid days — editable while Draft. |
| Paid days | Total − LOP. |
| Gross / Deductions / Net | Computed amounts. |

Each row expands to a component-level breakdown (prorated vs full + LOP deduction).

### Loss of Pay
- **Manual** — type LOP days while Draft; salary recomputes instantly.
- **Sync LOP from Leaves** — pulls approved unpaid-leave days for the month automatically.

*Proration example:* ₹30,000 in a 30-day month with 3 LOP days → paid 27/30 → gross ₹27,000, deductions prorate accordingly.

**Lifecycle (overview):** Draft → Pending Approval → Approved → Finalized → Paid. Only Draft runs are editable/deletable.

**One-line:** *Run Payroll creates a pay run for a period, computing every assigned employee's salary from their frozen breakdown, applies loss-of-pay (manual or synced) with live proration, and presents a reviewable salary register — the accurate basis that moves through approval to disbursement.*

---

## Doc 13 — Approving, Finalising & Paying a Run

**What it is:** The run's lifecycle after review — the controlled journey from reviewed draft to finalised, paid payroll, with governance and locking.

**Why it exists:** Money shouldn't leave on one click. This enforces authorisation, catches errors before they're permanent, makes the final register tamper-proof, and records every action.

### The lifecycle
| Stage | Transition | What happens |
|---|---|---|
| **Submit for Approval** | Draft → Pending Approval | Enters the default workflow at Step 1; locked from editing; logged as *submitted*. |
| **Approve / Reject** | moves through steps | Approve advances a step (final step → Approved); Reject (reason required) → back to Draft. Shows Step X of Y + a log of who/when/remarks. |
| **Finalize & Lock** | Approved → Finalized | Permanently immutable — no edits/LOP/deletion; dated; locked badge shown. |
| **Mark as Paid** | Finalized → Paid | Terminal — confirms disbursement; dated. |

### Immutability
| Status | Editable? | Deletable? |
|---|---|---|
| Draft | ✅ | ✅ |
| Pending Approval / Approved | ❌ | ❌ |
| Finalized / Paid | ❌ (permanent) | ❌ |

**Audit trail:** every run keeps an ordered history — Submitted → Approved (each step) → Finalized → Paid — with person, date, and remarks.

**One-line:** *This stage governs a run from reviewed draft to paid — Submit routes it through the workflow, approvers Approve step-by-step or Reject it back, Finalize & Lock makes it permanent, and Mark as Paid closes the period — every action authorised, locked, and audited.*

---

## Doc 14 — Payslips & Bank File (Generating the Outputs)

**What it is:** Turning a **finalised** run into its deliverables — a **payslip PDF per employee** and a **bank disbursement file** for the whole run.

**Why it exists:** A finalised register is correct but not yet delivered. This produces employee payslips and a bank-ready payment file — both generated *only* from a locked run so they always match what was approved.

### Why finalised-only
Both actions appear only once a run is **Finalized/Paid** — guaranteeing payslips and the bank file exactly match the authorised figures.

### Output A — Payslips
**Generate Payslips** creates one PDF per employee (downloadable per row). Each slip combines: the **payslip template** (branding/visible fields), the **employee profile** (statutory IDs + masked bank), and the **frozen breakdown** (earnings/deductions/gross/net/days). **Regenerate** reproduces them.

### Output B — Bank File
**Generate Bank File** produces one CSV in the configured bank format — one row per payable employee (beneficiary, account, IFSC, amount, mode, narration). Employees **without bank details are skipped and counted**. The result reports payees, total amount, and skipped count.

**One-line:** *From a finalised run, payroll produces a payslip PDF per employee (template + profile + frozen breakdown) and a bank disbursement file in the company's bank format (skipping/flagging anyone without bank details) — guaranteeing what employees see and the bank pays match the approved register.*

---
---

# Part D — Employee & Reporting

---

## Doc 15 — My Payslips (Employee Self-Service)

**What it is:** The employee-facing page — every employee views and downloads **their own** salary slips, for every period, without involving HR.

**Why it exists:** Employees need easy, private, on-demand access to pay records. This empowers self-service, reduces admin load, guarantees privacy, and gives a complete personal history.

### Access & privacy
Available to **all employees** (the rest of the module is admin-only) — safe because it is **self-scoped**: a user can only ever see their own payslips.

### What you see
- **Hero card** — latest payslip: period, net pay (large), gross/deductions summary, download.
- **History table** — Period, Gross, Deductions, LOP, Net Pay, Download for every past slip.

The page generates nothing — it surfaces payslips already produced from finalised runs (Doc 14).

**One-line:** *My Payslips is the employee self-service page to privately view and download one's own salary slips for every period — surfacing the PDFs payroll generated, scoped strictly to the viewer — so employees get payslips instantly without HR.*

---

## Doc 16 — Reports (Salary Register & Statutory Summary)

**What it is:** The analysis and compliance view — the whole pay run on one screen: the per-employee **Salary Register**, a **statutory totals** summary, and a **CSV export**.

**Why it exists:** A finished run must be reviewed in aggregate, reconciled, and reported. This gives the standard salary register, summarises statutory deductions for remittance, enables export, and provides a single reconciliation view.

### What you see
- **Run selector** — choose which pay run to report on.
- **Summary bar** — Period/status, Employees, Gross, Deductions, Net Payout.
- **Statutory & deduction totals** — each deduction type with its total across the run (the remittance figure).

### The Salary Register (dynamic table)
| Column group | Shows |
|---|---|
| Employee | Name + designation (fixed on screen). |
| Paid / LOP | Paid days + loss-of-pay days. |
| Earnings columns | One per earning component used. |
| Gross | Total earnings per employee. |
| Deduction columns | One per deduction component. |
| Net Pay | Take-home per employee (fixed on screen). |

Columns adapt to the components actually used in that run. A **Download CSV** export feeds accounting, audit, and statutory workings.

**One-line:** *Reports gives the whole-run view — a per-employee Salary Register with dynamic earning/deduction columns, a statutory totals summary, and a CSV export — so finance and compliance can review, reconcile, and file a completed run from one screen.*

---
---

## Appendix — Key Principles Across the Module

1. **Inheritance** — Settings → Structures → Employee assignments → Runs → Outputs/Reports. Each layer feeds the next.
2. **Freeze at assignment** — an employee's breakdown is frozen when assigned; template changes never alter agreed pay.
3. **Lock at finalisation** — a run's figures become immutable once finalised; what's approved is exactly what's paid and reported.
4. **One active per entity** — one default schedule, one default workflow, one active salary per employee, one run per period.
5. **Full audit** — runs record every submit/approve/reject/finalize/pay with who and when; salary revisions are preserved, never overwritten.
6. **Privacy by scope** — employees self-serve only their own payslips.
7. **Outputs match approvals** — payslips and bank files are produced only from finalised runs.

---

*End of manual.*
