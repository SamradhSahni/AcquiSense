import sys
import io
import os
import time
from pathlib import Path
from openai import OpenAI

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# -- Config -------------------------------------------------------------------
API_KEY = os.getenv("OPENAI_API_KEY", "")
MODEL = "o1-pro"   # Best available on this account
OUTPUT_DIR = Path(__file__).parent.parent / "seed_data"

client = OpenAI(api_key=API_KEY)

# -- Company context ----------------------------------------------------------
CONTEXT = (
    "Target Company: TechFlow Analytics Ltd\n"
    "Industry: B2B SaaS - Supply Chain Intelligence\n"
    "Founded: 2017, Bangalore, India (also HQ in Singapore)\n"
    "Employees: 247\n"
    "ARR: $18.4M USD (FY2024), Growth: 41% YoY, Gross Margin: 73%\n"
    "Burn: $420K/month (18 months runway)\n"
    "Product: FlowIQ - AI demand forecasting & inventory optimization SaaS\n"
    "Customers: 84 enterprise (avg ACV $219K)\n"
    "Investors: Sequoia India (Series B $22M), Elevation Capital\n"
    "Acquirer: Apex Capital Partners (PE, $4.2B AUM)\n"
    "Deal: Majority acquisition, EV $185M (10x ARR), 45-day DD window\n"
)

SYSTEM_PROMPT = (
    "You are an expert M&A due diligence professional (Big-4 partner level). "
    "Generate realistic, detailed, technically accurate due diligence documents. "
    "Use real-sounding company names, specific dollar/rupee amounts, actual dates, "
    "case numbers, and regulatory references. Include a mix of positive findings and "
    "realistic red flags. Format with numbered sections and sub-sections. "
    "Be as detailed and specific as a real document would be."
)

# -- Documents to generate ----------------------------------------------------
DOCUMENTS = [
    {
        "filename": "legal_material_contracts.txt",
        "domain": "legal",
        "title": "Material Contracts Schedule",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a detailed MATERIAL CONTRACTS SCHEDULE for this M&A due diligence data room.\n\n"
            "Include:\n"
            "1. TOP 10 CUSTOMER AGREEMENTS - for each: customer name (Fortune 500), contract value, start/end dates, "
            "renewal terms, termination clauses, change-of-control provisions that could be triggered\n"
            "2. TOP 5 VENDOR/SUPPLIER AGREEMENTS - AWS, Azure, data providers, key SaaS tools with costs and exit clauses\n"
            "3. MATERIAL IP LICENSES - third-party IP licensed in or out\n"
            "4. OFFICE LEASES - Bangalore HQ, Singapore\n"
            "5. EXECUTIVE EMPLOYMENT AGREEMENTS - CEO, CTO, CPO with non-compete durations\n"
            "6. CHANGE OF CONTROL PROVISIONS - flag which contracts need consent/have acceleration\n\n"
            "Include 3 red flags: one customer with 60-day termination-for-convenience, one AWS agreement needing transfer consent, "
            "one key contract with anti-assignment clause.\n"
            "Use realistic company names, dollar amounts, and dates throughout."
        ),
    },
    {
        "filename": "legal_ip_ownership.txt",
        "domain": "legal",
        "title": "Intellectual Property Ownership and Patent Schedule",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a detailed IP OWNERSHIP SCHEDULE for M&A due diligence.\n\n"
            "Include:\n"
            "1. PATENT PORTFOLIO - 4 patents (filed/granted) each with: patent number, title, jurisdiction, filing date, status, description\n"
            "2. TRADEMARK REGISTRATIONS - FlowIQ brand in India, Singapore, US, EU\n"
            "3. OPEN SOURCE AUDIT - OSS components used, their licenses, GPL contamination risks\n"
            "4. EMPLOYEE IP ASSIGNMENT - status with one exception flagged\n"
            "5. PENDING IP DISPUTES - one trade secret claim from a competitor\n"
            "6. DOMAIN NAMES AND SOCIAL HANDLES\n\n"
            "Include red flags: one GPL license risk in commercial product, one former engineer who left without full IP assignment."
        ),
    },
    {
        "filename": "legal_litigation_schedule.txt",
        "domain": "legal",
        "title": "Litigation and Claims Schedule",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a detailed LITIGATION AND CLAIMS SCHEDULE.\n\n"
            "Include 3 pending cases:\n"
            "1. Employment dispute - wrongful termination by senior engineer\n"
            "2. Customer SLA breach claim - data accuracy guarantee\n"
            "3. India tax dispute - transfer pricing adjustment\n\n"
            "For each: parties, court/forum, case number, nature of claim, claimed amount, "
            "outcome assessment, legal provision booked, outside counsel.\n\n"
            "Also include: GDPR complaints, 2 recently settled matters with amounts, D&O insurance status."
        ),
    },
    {
        "filename": "finance_pnl_fy2022_fy2024.txt",
        "domain": "finance",
        "title": "Profit and Loss Statement FY2022 to FY2024",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a detailed P&L STATEMENT for FY2022, FY2023, FY2024 (April-March, Indian GAAP/IFRS).\n\n"
            "Include line items: Subscription Revenue, Professional Services, Total Revenue, COGS breakdown, "
            "Gross Profit/Margin%, R&D (with headcount), S&M (with headcount), G&A, D&A, EBITDA/margin, "
            "EBIT, Net Interest, PBT, Tax, PAT, Net Margin%.\n\n"
            "KEY METRICS section: ARR at year end, New ARR, Churned ARR, NRR, CAC, LTV:CAC, Headcount.\n\n"
            "ARR trajectory: $9.2M (FY22) -> $13.1M (FY23) -> $18.4M (FY24).\n"
            "Use actual numbers in a well-formatted table.\n"
            "Flag: one revenue recognition policy concern and one related-party transaction."
        ),
    },
    {
        "filename": "finance_balance_sheet_fy2024.txt",
        "domain": "finance",
        "title": "Balance Sheet and Cash Flow Statement FY2024",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a detailed BALANCE SHEET as of March 31 2024 and CASH FLOW STATEMENT for FY2024.\n\n"
            "Balance Sheet: Cash breakdown, AR with aging schedule (<30d, 30-60d, 60-90d, >90d), "
            "Deferred Revenue breakdown, Fixed Assets, Intangibles (capitalized software), ROU Assets, "
            "AP, Accrued Liabilities, Series B Preference Shares with liquidation preference, Lease Liabilities, Cap table summary.\n\n"
            "Cash Flow: Operating (indirect), Investing, Financing.\n\n"
            "Ratios: Working Capital, Current Ratio, Quick Ratio, DSO.\n"
            "Flag: deferred revenue as % of ARR, customer concentration in AR aging."
        ),
    },
    {
        "filename": "finance_arr_waterfall_cohorts.txt",
        "domain": "finance",
        "title": "ARR Waterfall and Cohort Analysis FY2024",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate an ARR WATERFALL and COHORT ANALYSIS.\n\n"
            "1. MONTHLY ARR WATERFALL (Apr 2023 to Mar 2024): Starting ARR | +New Logo | +Expansion | -Churn | -Contraction | Ending ARR\n"
            "2. COHORT ANALYSIS (2018-2024 cohorts): starting customers, revenue at 12m/24m, NRR at 12m/24m/36m, Logo Retention\n"
            "3. CUSTOMER CONCENTRATION: top 10 customers by ARR (realistic company names), each customer's ARR, % of total, contract end date\n"
            "4. REVENUE RECOGNITION policy for multi-year contracts and professional services\n\n"
            "Flag: one customer at 18% of ARR with contract expiring in 6 months, currently in renewal negotiations."
        ),
    },
    {
        "filename": "hr_org_structure_headcount.txt",
        "domain": "hr",
        "title": "Organizational Structure and Headcount Analysis",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a detailed PEOPLE DUE DILIGENCE PACKAGE.\n\n"
            "1. ORG CHART: C-Suite (CEO Arjun Mehta 38, CTO Priya Nair 35, CPO Rahul Singh 36, CFO Shreya Kapoor 41, COO David Lim Singapore), "
            "department heads, team sizes, India (198) vs Singapore (28) vs Remote (21)\n"
            "2. HEADCOUNT METRICS: total 247, by dept (Eng 98, Sales 42, CS 35, Data Science 22, G&A 28, Marketing 22), "
            "attrition by dept, average tenure, time-to-fill, 31 open roles\n"
            "3. COMPENSATION BENCHMARKING: salary bands L1-L6, vs Radford market, variable comp structure\n"
            "4. KEY PERSON RISK: 5-7 critical employees, tenure, unique knowledge, flight risk, retention package\n\n"
            "Red flags: Engineering attrition 28%, 3 senior engineers resigned last 60 days post-acquisition rumor, VP-level non-compete expiry issue."
        ),
    },
    {
        "filename": "hr_employment_contracts_esop.txt",
        "domain": "hr",
        "title": "Employment Contracts ESOP Schedule and Benefits",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate an EMPLOYMENT CONTRACTS AND ESOP ANALYSIS.\n\n"
            "1. CONTRACT TYPES: standard India terms, Singapore MOM-compliant, 17 contractors (misclassification risk flagged), notice periods\n"
            "2. NON-COMPETE & NON-SOLICITATION: duration/scope per executive, enforceability under Indian law, "
            "one VP Sales with expired non-compete flagged\n"
            "3. ESOP PLAN: pool 12% fully diluted, granted 8.4%, vested 5.1%, unvested 3.3%, "
            "4-year/1-year cliff vesting, acceleration provisions (double vs single trigger), "
            "top 10 holders with grant/strike/fair value, treatment on acquisition\n"
            "4. BENEFITS: health insurance, gratuity liability (actuarial), PF/ESIC compliance\n"
            "5. COMPLIANCE: POSH policy, one pending harassment complaint flagged"
        ),
    },
    {
        "filename": "tax_india_compliance.txt",
        "domain": "tax",
        "title": "India Tax Compliance Summary and Pending Assessments",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a COMPREHENSIVE INDIA TAX DUE DILIGENCE REPORT.\n\n"
            "1. DIRECT TAX: filings for AY2022/23/24, one AY2023 scrutiny assessment for Rs 2.4Cr addition, "
            "R&D deduction under Sec 35(2AB), tax holiday under Sec 10AA (SEZ Bangalore), MAT credit\n"
            "2. TRANSFER PRICING: related party transactions with Singapore, Form 3CEB, BEPS compliance, "
            "pending TP adjustment notice Rs 8.1Cr, APA application status\n"
            "3. GST: registration, ITC position, one pending notice for ITC reversal Rs 47L, "
            "place of supply issues for international SaaS customers\n"
            "4. WITHHOLDING TAX: TDS compliance, one default notice for late deposit\n"
            "5. CONTINGENT LIABILITIES: total Rs 12.8Cr quantified, probability-weighted, indemnification recs"
        ),
    },
    {
        "filename": "tax_singapore_structure.txt",
        "domain": "tax",
        "title": "Singapore Entity Tax Structure and Transfer Pricing",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n"
            "Singapore entity: TechFlow Analytics Pte Ltd (incorporated 2019), APAC sales HQ, IP holding for patents 3-4\n\n"
            "Generate SINGAPORE TAX DUE DILIGENCE.\n\n"
            "1. CORPORATE STRUCTURE: 17% tax rate, EDB grants received, GST 9%, withholding on dividends\n"
            "2. IP HOLDING ARRANGEMENT: patents held in SG, royalty payments from India, arm's length rate documentation, IDI/Pioneer Status\n"
            "3. SUBSTANCE REQUIREMENTS: economic substance (28 headcount), PE risk, BEPS Pillar Two impact (15% GMT)\n"
            "4. ACQUISITION STRUCTURE: current holding (Sequoia India SPV -> SG HoldCo -> India OpCo), "
            "share vs asset deal tax impact, stamp duty, indirect transfer tax under Indian GAAR\n"
            "5. POST-ACQUISITION: repatriation strategy, India-Singapore DTAA, one-time restructuring cost $2.1M"
        ),
    },
    {
        "filename": "commercial_market_analysis.txt",
        "domain": "commercial",
        "title": "Market Analysis and Competitive Landscape",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a COMMERCIAL DUE DILIGENCE REPORT.\n\n"
            "1. TAM/SAM/SOM: supply chain analytics TAM $12.4B (2024) -> $28.7B (2030) CAGR 15.1%, SAM $3.2B, SOM $890M, key drivers\n"
            "2. COMPETITIVE LANDSCAPE: detailed analysis of 6 competitors including o9 Solutions, Kinaxis (public), Blue Yonder, Coupa, "
            "Llamasoft, one India local. For each: revenue, headcount, funding, differentiator, win/loss vs TechFlow\n"
            "3. WIN/LOSS ANALYSIS (last 12 months): win rate 34%, avg deal size won vs lost, top 3 reasons each, "
            "one critical gap: no native SAP/Oracle ERP integration (lost 4 deals)\n"
            "4. CUSTOMER SATISFACTION: NPS 47, G2/Gartner ratings, top 3 complaints, 5 testimonials\n"
            "5. GROWTH OPPORTUNITIES: MENA/SEA expansion, supplier risk management, GenAI roadmap"
        ),
    },
    {
        "filename": "commercial_sales_pipeline.txt",
        "domain": "commercial",
        "title": "Sales Pipeline and Go-to-Market Strategy",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a SALES AND GTM DUE DILIGENCE PACK.\n\n"
            "1. SALES ORG: 42 staff (6 Enterprise AEs, 12 MM AEs, 8 SDRs, 4 SEs, 4 CS-led expansion, 8 regional), "
            "71% quota attainment, sales cycle 6-9m enterprise/3-4m mid-market, avg ACV $380K/$95K\n"
            "2. CURRENT PIPELINE: 4 stages with 71 opps total $22.5M gross, $11.2M weighted, 1.8x coverage ratio (concern)\n"
            "3. TOP 10 PIPELINE OPPS: named opportunities (realistic Fortune 500 names), stage, ACV, probability, close date, key risk\n"
            "4. CHANNEL & PARTNERSHIPS: AWS Marketplace (12% sourced), Accenture referral, one partnership at risk post-acquisition\n"
            "5. PRICING: per-SKU/per-warehouse model, list vs contracted (28% avg discount), "
            "multi-year structure, concern: pricing inconsistency some customers at 50% of list"
        ),
    },
    {
        "filename": "tech_architecture_infrastructure.txt",
        "domain": "technology",
        "title": "Technical Architecture Stack and Infrastructure Review",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a TECHNICAL DUE DILIGENCE PACKAGE.\n\n"
            "1. ARCHITECTURE: multi-tenant SaaS on AWS (ap-south-1, DR ap-southeast-1), 14 microservices, "
            "data pipeline: customer ERP -> Kafka -> Spark -> ML -> API -> React, "
            "key AWS services: EKS, RDS PostgreSQL, Redshift, S3, SageMaker, Lambda, CloudFront, "
            "uptime last 12m: 99.71% (below 99.9% SLA)\n"
            "2. TECH STACK: Python FastAPI, Node.js BFF, React/TypeScript, PyTorch, Spark, Kafka, Airflow, dbt, Redshift, "
            "Terraform, Kubernetes/ArgoCD, Datadog\n"
            "3. TECHNICAL DEBT: monolithic demand_engine_v1.py (47K lines), no unit tests on 3 critical services, "
            "Python 2.7->3.12 migration 60% done, one service on EOL Ubuntu 18.04, remediation cost $1.2M/8 months\n"
            "4. SCALABILITY: current peak capacity, Redshift bottleneck ($180K upgrade for 3x scale)\n"
            "5. CLOUD COSTS: AWS spend $2.4M FY2024 (13% of revenue), $380K optimization opportunity, 67% RI coverage"
        ),
    },
    {
        "filename": "tech_sdlc_code_quality.txt",
        "domain": "technology",
        "title": "Software Development Lifecycle and Code Quality Report",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate an SDLC AND CODE QUALITY REPORT.\n\n"
            "1. PROCESS: Agile/Scrum 2-week sprints, 8 squads, GitHub Actions->ArgoCD->EKS, "
            "18 deploys/week, lead time 2.3 days, change failure rate 8%\n"
            "2. CODE METRICS: 847K LOC (Python 52%, TS 28%, SQL 12%), test coverage 61% unit/34% integration, "
            "SonarQube: 847 code smells, 23 critical bugs, 12 security hotspots, tech debt ratio 14.2%\n"
            "3. DEPENDENCIES: 234 direct Python deps, 6 CVE vulnerabilities (2 high, 1 critical Log4Shell variant), "
            "43 packages >2 major versions behind, 2 GPL packages in commercial product\n"
            "4. DOCUMENTATION: 70% Swagger coverage, 28 ADRs, 14 runbooks, 4 ML models with no documented assumptions\n"
            "5. IP PROTECTION: private GitHub org, 98 repos, SOC2 Type II pending Feb 2025, one IP assignment exception"
        ),
    },
    {
        "filename": "cyber_security_assessment.txt",
        "domain": "cybersecurity",
        "title": "Cybersecurity Assessment and Incident History",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a CYBERSECURITY DUE DILIGENCE REPORT.\n\n"
            "1. POSTURE: 4-person security team, ISO 27001 certified, SOC2 Type II 70% controls, "
            "last pentest March 2024 (Cobalt.io), CVSS 6.8/10\n"
            "2. PENTEST FINDINGS: 2 critical (both fixed), 8 high (5 fixed, 3 open), 14 medium, 22 low. "
            "Detail the 3 open high findings: SSRF in API gateway, privilege escalation in admin portal, insufficient logging\n"
            "3. INCIDENT HISTORY: Aug 2023 phishing (3 creds compromised, contained 4h, CERT-In notified), "
            "Nov 2022 DDoS (47min outage, $84K SLA credits), Mar 2022 S3 misconfiguration "
            "(2100 records public 6h, GDPR notification filed, investigation open)\n"
            "4. DATA PRIVACY: DPA agreements with EU customers, India DPDP Act gap analysis, one open Berlin DPA complaint\n"
            "5. ACCESS CONTROLS: MFA 94% enforcement, zero-trust 40% complete, CyberArk partial, "
            "47 former employee accounts not deprovisioned (critical finding)"
        ),
    },
    {
        "filename": "regulatory_licenses_compliance.txt",
        "domain": "regulatory",
        "title": "Regulatory Licenses Compliance and Government Filings",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a REGULATORY COMPLIANCE DUE DILIGENCE REPORT.\n\n"
            "1. LICENSES: India (MCA21, GST, IEC, STPI, SEZ), Singapore (ACRA, MOM, MAS exemption), US (Delaware C-Corp)\n"
            "2. DATA PROTECTION: India DPDP Act 2023 assessment pending, Singapore PDPA registered DPO, "
            "EU GDPR legal basis/SCCs/DPA register, US CCPA policy in place\n"
            "3. GOVERNMENT INCENTIVES: STPI 10A deduction, SEZ Whitefield Bangalore export obligations, "
            "EDB Singapore grants S$280K (3-year headcount condition)\n"
            "4. ANTITRUST: India CCI filing required (combined assets above threshold), timeline 30-210 days (key deal risk), "
            "Singapore CCS no filing needed\n"
            "5. SECTOR SPECIFIC: SEBI (Sequoia portfolio), RBI FEMA compliance, "
            "one show-cause notice from RBI for delayed FEMA reporting (Rs 15L penalty proposed)"
        ),
    },
    {
        "filename": "esg_sustainability_report.txt",
        "domain": "esg",
        "title": "ESG Assessment and Sustainability Report",
        "prompt": (
            f"{SYSTEM_PROMPT}\n\n"
            f"Company context:\n{CONTEXT}\n\n"
            "Generate a FULL ESG DUE DILIGENCE ASSESSMENT.\n\n"
            "1. ENVIRONMENTAL: Scope 1 (0 tCO2e), Scope 2 (847 tCO2e offices), Scope 3 (12400 tCO2e AWS), "
            "AWS 85% renewable, office energy Bangalore 580 MWh + Singapore 124 MWh, no net-zero commitment (gap)\n"
            "2. SOCIAL: gender diversity 28% women / 19% in Engineering, pay equity 94 cents/$1, "
            "42h training/employee/year, 120h CSR/employee, no tier-1 supplier ESG assessments (gap)\n"
            "3. GOVERNANCE: 6-member board (2 independent, 2 Sequoia, 1 Elevation, CEO), "
            "no independent audit committee chair (gap), 2 related-party transactions (disclosed), "
            "whistleblower policy 2 complaints resolved, FCPA/Bribery Act training 78% (gap)\n"
            "4. RATINGS & FRAMEWORKS: no formal ESG rating, partial GRI disclosure, BRSR FY2025 obligation, "
            "Apex Capital ESG reporting requirement by Year 2\n"
            "5. RISKS: no AI ethics/bias testing policy, data sovereignty increasing, Bangalore office moderate flood risk, "
            "recommendation: hire ESG Manager within 90 days post-close"
        ),
    },
]


# -- Helper: call OpenAI (o1-pro compatible) ----------------------------------
def call_model(prompt: str) -> tuple[str, int]:
    is_o_series = MODEL.startswith("o1") or MODEL.startswith("o3") or MODEL.startswith("o4")
    kwargs = dict(
        model=MODEL,
        messages=[{"role": "user", "content": prompt}],
    )
    if is_o_series:
        kwargs["max_completion_tokens"] = 4000
    else:
        kwargs["temperature"] = 0.7
        kwargs["max_tokens"] = 3500

    resp = client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content, resp.usage.total_tokens


# -- Helper: write TXT --------------------------------------------------------
def write_txt(path: Path, title: str, content: str):
    header = (
        f"TECHFLOW ANALYTICS LTD -- DUE DILIGENCE DATA ROOM\n"
        f"DOCUMENT: {title}\n"
        f"DATE: {time.strftime('%d %B %Y')}\n"
        f"CLASSIFICATION: HIGHLY CONFIDENTIAL -- M&A\n"
        f"{'=' * 80}\n\n"
    )
    path.write_text(header + content, encoding="utf-8")


# -- Helper: write PDF (optional) ---------------------------------------------
def write_pdf(path: Path, title: str, content: str) -> bool:
    try:
        from fpdf import FPDF

        pdf = FPDF()
        pdf.set_auto_page_break(auto=True, margin=20)
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_fill_color(30, 50, 80)
        pdf.set_text_color(255, 255, 255)
        pdf.cell(0, 12, title[:80], fill=True, ln=True, align="C")
        pdf.ln(4)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(100, 100, 100)
        pdf.set_fill_color(240, 240, 245)
        pdf.cell(0, 8, f"  TechFlow Analytics Ltd  |  Confidential  |  {time.strftime('%d %b %Y')}", fill=True, ln=True)
        pdf.ln(5)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(30, 30, 30)
        for line in content.split("\n"):
            stripped = line.strip()
            if not stripped:
                pdf.ln(2)
            elif stripped.isupper() and len(stripped) > 4 or stripped.startswith("---"):
                pdf.set_font("Helvetica", "B", 11)
                pdf.set_text_color(30, 50, 80)
                pdf.multi_cell(0, 6, stripped)
                pdf.set_font("Helvetica", "", 10)
                pdf.set_text_color(30, 30, 30)
            else:
                try:
                    pdf.multi_cell(0, 5, line)
                except Exception:
                    pdf.multi_cell(0, 5, line.encode("latin-1", "replace").decode("latin-1"))
        pdf.output(str(path))
        return True
    except Exception:
        return False


# -- Main ---------------------------------------------------------------------
def main():
    print(f"\n{'=' * 58}")
    print(f"  AcquiSense -- Test Data Generator")
    print(f"  Model  : {MODEL}")
    print(f"  Docs   : {len(DOCUMENTS)}")
    print(f"  Output : {OUTPUT_DIR}")
    print(f"{'=' * 58}\n")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Company summary
    summary = OUTPUT_DIR / "company_overview.txt"
    summary.write_text(
        f"TECHFLOW ANALYTICS LTD -- ACQUISITION OVERVIEW\n{'=' * 80}\n\n{CONTEXT}\n"
        f"\nThis data room: {len(DOCUMENTS)} documents across 9 DD domains.\n"
        f"Generated: {time.strftime('%d %B %Y %H:%M')}\n",
        encoding="utf-8",
    )
    print(f"  [*] Written: company_overview.txt")

    for i, doc in enumerate(DOCUMENTS, 1):
        domain_dir = OUTPUT_DIR / doc["domain"]
        domain_dir.mkdir(parents=True, exist_ok=True)

        print(f"\n  [{i:02d}/{len(DOCUMENTS)}] [{doc['domain'].upper():12s}] {doc['title']}")
        print(f"         Calling {MODEL}...", end=" ", flush=True)

        try:
            content, tokens = call_model(doc["prompt"])
            print(f"done ({tokens} tokens)")

            txt_path = domain_dir / doc["filename"]
            write_txt(txt_path, doc["title"], content)
            print(f"         Saved : seed_data/{doc['domain']}/{doc['filename']}")

            pdf_path = domain_dir / doc["filename"].replace(".txt", ".pdf")
            if write_pdf(pdf_path, doc["title"], content):
                print(f"         + PDF : seed_data/{doc['domain']}/{doc['filename'].replace('.txt', '.pdf')}")

        except Exception as e:
            print(f"ERROR: {e}")

        if i < len(DOCUMENTS):
            time.sleep(1)

    # Final summary
    all_files = list(OUTPUT_DIR.rglob("*.*"))
    print(f"\n{'=' * 58}")
    print(f"  DONE! {len(all_files)} files generated in seed_data/")
    print(f"{'=' * 58}")
    print("\nNext steps:")
    print("  1. Open  http://localhost:5173")
    print("  2. Click 'New Deal' -> upload files from seed_data/")
    print("  3. Watch 13 AI agents analyze your documents live!\n")


if __name__ == "__main__":
    main()
