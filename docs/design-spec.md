# CytoLens — Product Design Specification

**Version 0.1 | 2026-06-01**
**cytolens.app | github.com/cytolens**

---

## 1. Vision & Positioning

### Statement

CytoLens replaces FlowJo's slow, manual gating workflow with AI-assisted analysis that runs in your browser, on your desktop, and on your data. Built by a flow cytometry researcher, for researchers who'd rather think about biology than wrestle with software from 2003.

### Problem

Flow cytometry is one of the most widely used quantitative methods in immunology, haematology, and oncology. Every major immunology lab runs it. Yet the dominant analysis software — FlowJo — was architecturally frozen in the early 2000s. It requires manual gate drawing for every sample, produces 72 DPI figures that journals reject, has no real-time collaboration, locks data in proprietary formats, and costs up to $4,140/year per seat. The field has tolerated this because no credible open alternative existed.

The consequence is real: inter-operator gating variability of up to 32% in published studies. Reproducibility crises in clinical flow data. Hours of analyst time per experiment that should take minutes. Postdocs copying numbers from FlowJo into Excel at midnight.

### Solution

CytoLens is the analysis tool that flow cytometrists would have built themselves if they had the engineering resources. AI-assisted gating removes the tedium. Real-time statistics eliminate the recalculation cycle. Open standards (GatingML, Logicle) ensure reproducibility. A browser-first architecture enables collaboration without institutional VPNs. And the whole thing is free and open-source for individual researchers.

### Positioning Statement

"The flow cytometry analysis platform that makes AI do the tedious work — so you can focus on the biology."

### Differentiation from Existing Alternatives

| Tool | Core problem |
|---|---|
| FlowJo | Manual, slow, expensive, proprietary, BD-owned |
| FCS Express | Expensive, still manual, Windows-centric |
| Cytobank | Cloud only, expensive, closed-source |
| OMIQ | Subscription SaaS, no desktop, limited offline |
| R/Bioconductor (flowCore etc.) | Code-first, inaccessible to bench scientists |
| OpenCyto | Powerful but requires R knowledge and days to install |

CytoLens occupies the gap: GUI-driven like FlowJo, intelligent like none of the above, open-source and free to use.

---

## 2. Target Users (Personas)

### Persona 1 — Dr Sarah Chen, Postdoc (Primary)

**Role:** Immunology postdoc, 3rd year, PBMC phenotyping + CAR-T experiments
**Lab:** 8-person academic lab, 2 shared flow cytometers (BD LSRFortessa + Cytek Aurora)
**Pain:** Spends 2-3 hours gating per experiment. Principal investigator expects figures the next morning. FlowJo licence shared across 4 people, so she's often locked out. Cannot reproduce a colleague's gates from a .wsp file on her own machine.
**Goal:** Finish gating in 20 minutes. Get 300 DPI figures straight out of the software. Share a workspace link with her supervisor without emailing .wsp files.
**Willingness to pay:** Zero personally. Would advocate strongly for institutional adoption if it's free for her.

### Persona 2 — Prof James Okafor, PI (Economic Buyer)

**Role:** Group leader, 15-person lab, runs 3 flow cytometers
**Pain:** FlowJo seats cost £3,200/year. Renews annually. New lab members can't afford personal licences. BD's ownership of FlowJo makes him uncomfortable given his lab uses Cytek and Sony instruments.
**Goal:** Cut software costs. Standardise gating protocols across the lab. Have a reproducible audit trail for GxP work feeding into a clinical trial.
**Willingness to pay:** Would pay £200-800/year for an institutional site licence with guaranteed support and compliance documentation.

### Persona 3 — Alex Müller, Core Facility Manager (Power User)

**Role:** Runs a 6-instrument shared flow facility, serves 40+ labs
**Pain:** Every lab has their own FlowJo workspace style. No standardisation. New users need training. Figures submitted to journals are inconsistent quality. No way to enforce a lab's gating template across all users on a shared machine.
**Goal:** Standardise gating templates facility-wide. Export publication-ready figures automatically. Run batch analysis overnight without babysitting.
**Willingness to pay:** £500-1,500/year for facility licence with training materials.

### Persona 4 — Dr Priya Nair, Clinical Trial Scientist (Compliance User)

**Role:** Flow cytometry lead at a biotech running a Phase II CAR-T trial
**Pain:** FDA expects a complete audit trail for gating decisions. FlowJo has no versioning, no change logs, no electronic signatures. She currently exports screenshots of each gate and stores them manually.
**Goal:** GxP-compliant analysis with full audit trail, electronic signatures, and 21 CFR Part 11-compatible records. Data security that satisfies regulatory submissions.
**Willingness to pay:** £2,000-5,000/year per validated instance. Would pay for vendor-validated deployment.
