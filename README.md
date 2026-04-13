# OrgPulse — Salesforce Architecture Health & Insights

> **AI-powered architecture intelligence for Salesforce orgs — right inside VS Code.**

OrgPulse gives Salesforce architects, developers, and tech leads a real-time pulse on the health of their org. It connects to your authenticated Salesforce org, analyzes metadata across 8 dimensions, scores your org's health 0–100, and delivers AI-powered explanations and actionable fixes — all without leaving VS Code.

---

## ✨ Why OrgPulse?

| Without OrgPulse                                  | With OrgPulse                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| Manual code reviews miss systemic patterns        | Automated analysis across every Apex class, trigger, Flow, and object |
| Security gaps lurk in permissions and credentials | Dedicated security scanner flags risks instantly                      |
| Test coverage blind spots go unnoticed            | Live coverage data pulled directly from the org                       |
| Technical debt builds silently                    | Quantified health score with trend tracking                           |
| SOQL performance issues found in production       | Query risk analysis before deployment                                 |
| AI help requires context-switching to a browser   | GitHub Copilot explanations inline in the issue panel                 |

---

## 🚀 Features

### 🔬 8-Dimension Analysis Engine

| Dimension                  | What's Analyzed                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Apex Code Quality**      | SOQL/DML in loops, hardcoded IDs, trigger size, missing sharing keywords, method length, class complexity |
| **Automation Design**      | Flow count per object, Process Builder detection, trigger-per-object enforcement, recursive flow risks    |
| **Data Model Health**      | Unused/deprecated fields, field-level security coverage, object complexity metrics                        |
| **Query Performance**      | Non-selective SOQL, missing LIMIT/WHERE, loop queries, large data volume risks                            |
| **Test Coverage**          | Per-class coverage from org, below-threshold detection, untested trigger identification                   |
| **Security & Permissions** | ModifyAll/ViewAll abuse, legacy credentials, exposed API keys, profile-level risks                        |
| **Integrations**           | Connected App audit, named credential gaps, REST/SOAP endpoint risks                                      |
| **Governor Limits**        | CPU time, heap, DML, SOQL governor risk predictions                                                       |

### 🤖 AI-Powered Issue Explanations

- Click **"Explain with AI"** on any issue to get a GitHub Copilot-powered explanation
- Each explanation includes: **Summary**, **Business Impact**, **How to Fix**, and a **Code Example**
- One-time consent gate — you stay in control
- Requires GitHub Copilot (free tier supported)

### 📊 Interactive Enterprise Dashboard

- 7-tab dashboard: Overview, Code, Automation, Data Model, Performance, Security, Testing
- Drill-down panel for every issue — file location, severity, rule details, AI explanation
- Real-time health score (0–100) with letter grade (A–F)
- Animated score ring, trend badges, and category breakdowns

### 📤 Multi-Format Export

- **HTML** — shareable, self-contained report for stakeholders
- **JSON** — raw data for CI/CD pipelines and custom tooling
- **SARIF 2.1.0** — GitHub Code Scanning compatible, works in PR checks
- **Text** — plain text for logging and email

### ⚡ Performance & Scalability

- **File-hash cache** — skips unchanged files, re-analyzes only what's different
- **FileSystem watcher** — auto-invalidates cache when `.cls` or `.trigger` files change
- **Third-party plugin API** — extend OrgPulse with your own org-specific rules

---

## 🔐 Built for Enterprise Trust

OrgPulse is designed with a **security-first AI architecture** — your org's data never leaves your environment without your explicit consent.

| Trust Guarantee               | Detail                                                               |
| ----------------------------- | -------------------------------------------------------------------- |
| ✔ **No record data accessed** | Analysis runs on metadata only — no records, no business data        |
| ✔ **No PII processed**        | Emails, names, and personal data are never read or transmitted       |
| ✔ **No external storage**     | Metadata and code are never stored outside your local environment    |
| ✔ **Local-first engine**      | All analysis runs on your machine — offline-capable by default       |
| ✔ **Anonymized AI insights**  | AI receives only aggregated, de-identified patterns — never raw code |

### 🔒 Selectable Security Modes

You stay in full control with three transparent operating modes:

| Mode                 | Behaviour                                                     |
| -------------------- | ------------------------------------------------------------- |
| 🟢 **Safe Mode**     | 100% local analysis — no AI calls, no network traffic         |
| 🟡 **Standard Mode** | AI enabled on aggregated insights only — no raw metadata sent |
| 🔴 **Advanced Mode** | Deeper AI reasoning with explicit per-session user consent    |

> Mode selection is persisted per workspace and can be changed at any time from the OrgPulse dashboard or via **`OrgPulse: Set Security Mode`** command.

---

## 📋 Requirements

- **VS Code** 1.100.0 or higher
- **Salesforce CLI (`sf`)** installed and authenticated
- **Connected Salesforce org** (DevHub, Sandbox, Developer Edition, or Production)
- **GitHub Copilot** (optional — for AI explanations)

---

## 🔧 Installation

### From the Marketplace

Search for **OrgPulse** in the VS Code Extensions panel, or install via:

```
ext install babukareti.orgpulse
```

### From VSIX

```bash
code --install-extension orgpulse-1.0.0.vsix
```

### From Source

```bash
git clone https://github.com/bkareti/VSCode_Ext_OrgHealthAnalyzer.git
cd VSCode_Ext_OrgHealthAnalyzer
npm install
npm run compile
```

---

## ▶️ Usage

### Quick Start

1. Open a Salesforce project workspace (must contain `sfdx-project.json`)
2. Authenticate: `sf org login web --set-default`
3. Press `Ctrl+Shift+P` → **OrgPulse: Run Org Health Analysis**
4. View results in the **OrgPulse Results** sidebar or open the **Dashboard**

### Commands

| Command                             | Description                                 |
| ----------------------------------- | ------------------------------------------- |
| `OrgPulse: Run Org Health Analysis` | Full 8-step analysis on connected org       |
| `OrgPulse: Analyze Current File`    | Analyze the open Apex class or trigger      |
| `OrgPulse: Open Dashboard`          | Open the interactive 7-tab dashboard        |
| `OrgPulse: Export Health Report`    | Export as HTML, JSON, or Text               |
| `OrgPulse: Export SARIF Report`     | Export SARIF 2.1.0 for GitHub Code Scanning |
| `OrgPulse: Clear Analysis Cache`    | Reset the file-hash cache                   |
| `OrgPulse: Revoke AI Consent`       | Reset GitHub Copilot AI consent             |

---

## ⚙️ Extension Settings

| Setting                                              | Default     | Description                         |
| ---------------------------------------------------- | ----------- | ----------------------------------- |
| `sfHealthAnalyzer.rules.maxTriggersPerObject`        | `1`         | Maximum triggers per object         |
| `sfHealthAnalyzer.rules.maxFlowsPerObject`           | `3`         | Maximum active flows per object     |
| `sfHealthAnalyzer.rules.maxTriggerLines`             | `200`       | Maximum lines in a trigger          |
| `sfHealthAnalyzer.rules.maxClassLines`               | `500`       | Maximum lines in a class            |
| `sfHealthAnalyzer.rules.maxMethodLines`              | `50`        | Maximum lines in a method           |
| `sfHealthAnalyzer.rules.maxValidationRulesPerObject` | `10`        | Maximum validation rules per object |
| `sfHealthAnalyzer.severity.threshold`                | `warning`   | Minimum severity to display         |
| `sfHealthAnalyzer.scoring.weights`                   | (see below) | Category score weights              |
| `sfHealthAnalyzer.ai.enabled`                        | `true`      | Enable AI-powered explanations      |
| `sfHealthAnalyzer.ai.provider`                       | `copilot`   | AI provider (`copilot`)             |
| `sfHealthAnalyzer.plugins`                           | `[]`        | Paths to third-party plugin files   |

### Default Scoring Weights

```json
{
  "codeQuality": 25,
  "automationDesign": 20,
  "dataModel": 15,
  "performance": 20,
  "security": 10,
  "testing": 5,
  "integration": 5
}
```

### Project-level Configuration

Create `.sfhealthrc.json` in your workspace root:

```json
{
  "rules": {
    "no-soql-in-loop": "error",
    "no-dml-in-loop": "error",
    "no-hardcoded-ids": "warning",
    "max-trigger-lines": ["warning", { "maxLines": 150 }],
    "no-business-logic-in-trigger": "warning",
    "max-flows-per-object": ["error", { "maxFlows": 2 }]
  },
  "exclude": ["**/test/**", "**/*Test.cls"]
}
```

---

## 🧩 Plugin API

Extend OrgPulse with custom rules for your org's standards:

```typescript
// my-custom-rules.js
module.exports = {
  id: "my-org-rules",
  name: "My Org Custom Rules",
  version: "1.0.0",
  async analyze(context) {
    const issues = [];
    for (const cls of context.apexClasses) {
      if (cls.name.startsWith("Legacy_")) {
        issues.push({
          ruleId: "no-legacy-prefix",
          severity: "warning",
          message: `Class "${cls.name}" uses deprecated "Legacy_" naming prefix`,
          category: "code-quality",
        });
      }
    }
    return issues;
  },
};
```

Register in settings:

```json
"sfHealthAnalyzer.plugins": ["./my-custom-rules.js"]
```

---

## 🏗️ Architecture

```
src/
├── analyzers/           # 7 domain analyzers
├── rules/               # Rules engine + 17 built-in rules + plugin API
├── services/            # Salesforce CLI/API + AI service
├── reports/             # HTML / JSON / Text / SARIF generators
├── ui/                  # Dashboard webview + tree view
├── utils/               # Cache, config, logger, errors
├── types/               # TypeScript type definitions
└── extension.ts         # Entry point
media/
├── dashboard.js         # Interactive dashboard UI
└── dashboard.css        # Dashboard styles
```

---

## 📜 Built-in Rules

| Rule ID                 | Category     | Severity |
| ----------------------- | ------------ | -------- |
| `soql-in-loop`          | Performance  | Error    |
| `dml-in-loop`           | Performance  | Error    |
| `hardcoded-id`          | Security     | Warning  |
| `trigger-size`          | Code Quality | Warning  |
| `trigger-logic`         | Architecture | Warning  |
| `missing-bulkification` | Performance  | Error    |
| `class-size`            | Code Quality | Info     |
| `method-length`         | Code Quality | Info     |
| `missing-sharing`       | Security     | Warning  |
| `system-debug`          | Code Quality | Info     |
| `non-selective-query`   | Performance  | Warning  |
| `automation-complexity` | Automation   | Warning  |
| `unused-fields`         | Data Model   | Info     |
| `test-coverage`         | Testing      | Error    |
| `modifyall-permission`  | Security     | Error    |
| `legacy-credential`     | Security     | Error    |

---

## 📝 Release Notes

### 1.9.3 — New Icon & Enterprise Trust

- 🖼️ New OrgPulse icon with animated ECG line — replacing the heart emoji across all UI surfaces
- 🔐 "Built for Enterprise Trust" compliance section added to README and Marketplace listing
- 🟢🟡🔴 Security mode documentation: Safe / Standard / Advanced mode descriptions published
- 📋 Extension summary updated with privacy guarantees and data handling transparency

### 1.9.2 — CTA Architecture Review (12-Section Premium Report)

- 🏗️ CTA Architecture Review rebuilt from 6 → 12 executive sections
- Added: Architecture Maturity Assessment, Business Impact Analysis, Risk Register, Technical Debt Quantification, Modernization Roadmap, Strategic Recommendations, and more
- AI synthesis prompt rewritten for structured 12-section schema

### 1.9.1 — Enterprise Security Modes

- 🛡️ Three-tier security mode selector: Safe / Standard / Advanced
- Defence-in-depth AI gating with transparency panel
- Security mode persisted per workspace

### 1.9.0 — Intelligent Scanning Screen

- 🎨 Complete redesign of scanning/progress screen
- Conversational AI messages with insight teasers
- Gradient pulsing orb with radar sweep animation
- Collapsible technical details panel

### 1.0.0 — OrgPulse GA

- 🎉 Rebranded to **OrgPulse — Salesforce Architecture Health & Insights**
- 🤖 AI-powered issue explanations via GitHub Copilot (`vscode.lm` API)
- ⚡ File-hash analysis cache with FileSystem watcher
- 🔌 Third-party plugin API for custom rules
- 📤 SARIF 2.1.0 export for GitHub Code Scanning
- 🔒 One-time AI consent gate with revoke option
- 🏗️ 8-step analysis engine: Apex, Queries, Automation, Data Model, Coverage, Security, Integrations, Plugins

### 0.0.4

- Enterprise 7-tab dashboard with drill-down panels
- 3 new analyzers: Test Coverage, Security/Permissions, Integrations
- 17 built-in rules across 7 categories
- Org metadata analysis via Salesforce Tooling API

### 0.0.3

- Improved extension icon clarity for Marketplace display

### 0.0.1

- Initial release: Apex analysis, automation detection, data model health, query performance, health scoring

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-rule`
3. Implement your changes
4. Run: `npm run compile && npm test`
5. Submit a pull request

## 📄 License

MIT — see [LICENSE](LICENSE.txt)

---

**Give your Salesforce org a pulse check. 💓**

## Features

### 🔍 Apex Code Quality Analyzer

- Detects SOQL/DML operations inside loops
- Identifies hardcoded IDs and credentials
- Analyzes trigger complexity and best practices
- Enforces separation of concerns patterns

### ⚡ Automation Complexity Analyzer

- Analyzes Flows, Process Builders, and Validation Rules
- Detects automation conflicts per object
- Identifies recursive flow risks
- Measures automation complexity scores

### 📊 Data Model Health Analyzer

- Tracks custom field usage and adoption
- Identifies unused or deprecated fields
- Analyzes field-level security coverage
- Reports on object complexity metrics

### 🔎 Query Risk Analyzer

- Detects unselective SOQL queries
- Identifies missing WHERE clauses and LIMIT usage
- Analyzes query patterns for performance risks
- Reports on query complexity

### 📈 Org Health Score (0-100)

- Weighted scoring across all analyzers
- Category breakdown (Code Quality, Automation, Data Model, Performance)
- Interactive dashboard with drill-down details
- Trend tracking over time

## Requirements

- **VS Code** 1.100.0 or higher
- **Salesforce CLI (sf)** installed and configured
- **Authenticated Salesforce org** (DevHub, Sandbox, or Production)

## Installation

1. Install from VS Code Marketplace (coming soon)
2. Or build from source:
   ```bash
   git clone <repository>
   cd VSCode_Ext_OrgHealthAnalyzer
   npm install
   npm run compile
   ```

## Usage

### Commands

| Command                                | Description                              |
| -------------------------------------- | ---------------------------------------- |
| `Salesforce: Run Org Health Analyzer`  | Run full analysis on connected org       |
| `Salesforce: Analyze Current File`     | Analyze the currently open Apex file     |
| `Salesforce: Open Health Dashboard`    | Open the interactive dashboard           |
| `Salesforce: Refresh Analysis Results` | Refresh the results tree view            |
| `Salesforce: Export Health Report`     | Export report as HTML, JSON, or Markdown |

### Running Analysis

1. Open a Salesforce project workspace
2. Ensure you're authenticated to an org (`sf org login web`)
3. Run the command: **Salesforce: Run Org Health Analyzer**
4. View results in the Health Analysis sidebar or Dashboard

## Extension Settings

Configure thresholds and rules in VS Code settings:

| Setting                                 | Default | Description                         |
| --------------------------------------- | ------- | ----------------------------------- |
| `sfHealthAnalyzer.enabled`              | `true`  | Enable/disable the extension        |
| `sfHealthAnalyzer.maxTriggersPerObject` | `1`     | Maximum triggers allowed per object |
| `sfHealthAnalyzer.maxFlowsPerObject`    | `3`     | Maximum flows allowed per object    |
| `sfHealthAnalyzer.maxQueryComplexity`   | `5`     | Maximum SOQL query complexity       |
| `sfHealthAnalyzer.maxTriggerLines`      | `200`   | Maximum lines in a trigger          |
| `sfHealthAnalyzer.warnOnSOQLInLoop`     | `true`  | Warn on SOQL in loops               |
| `sfHealthAnalyzer.warnOnDMLInLoop`      | `true`  | Warn on DML in loops                |
| `sfHealthAnalyzer.warnOnHardcodedIds`   | `true`  | Warn on hardcoded Salesforce IDs    |

### Configuration File

Create `.sfhealthrc.json` in your workspace root for project-specific rules:

```json
{
  "rules": {
    "no-soql-in-loop": "error",
    "no-dml-in-loop": "error",
    "no-hardcoded-ids": "warning",
    "max-trigger-lines": ["warning", { "maxLines": 150 }],
    "no-business-logic-in-trigger": "warning",
    "max-flows-per-object": ["error", { "maxFlows": 2 }],
    "max-triggers-per-object": ["error", { "maxTriggers": 1 }]
  },
  "exclude": ["**/test/**", "**/*Test.cls"]
}
```

## Architecture

```
src/
├── analyzers/           # Domain-specific analyzers
│   ├── apexAnalyzer.ts
│   ├── automationAnalyzer.ts
│   ├── queryAnalyzer.ts
│   └── dataModelAnalyzer.ts
├── rules/               # Configurable rules engine
│   ├── engine.ts
│   ├── types.ts
│   └── index.ts
├── services/            # External integrations
│   └── salesforceService.ts
├── reports/             # Report generation
│   ├── healthScore.ts
│   └── reportGenerator.ts
├── ui/                  # User interface
│   ├── dashboard.ts
│   └── treeProvider.ts
├── utils/               # Utilities
│   ├── config.ts
│   ├── errors.ts
│   └── logger.ts
├── types/               # TypeScript definitions
│   └── index.ts
└── extension.ts         # Entry point
```

## Built-in Rules

| Rule ID                        | Category        | Description                             |
| ------------------------------ | --------------- | --------------------------------------- |
| `no-soql-in-loop`              | Performance     | Detects SOQL queries inside loops       |
| `no-dml-in-loop`               | Performance     | Detects DML operations inside loops     |
| `no-hardcoded-ids`             | Security        | Detects hardcoded Salesforce IDs        |
| `max-trigger-lines`            | Maintainability | Enforces trigger size limits            |
| `no-business-logic-in-trigger` | Architecture    | Ensures triggers delegate to handlers   |
| `separation-of-concerns`       | Architecture    | Enforces proper layer separation        |
| `max-flows-per-object`         | Automation      | Limits flows per object                 |
| `max-triggers-per-object`      | Automation      | Enforces one-trigger-per-object pattern |

## Known Issues

- Tree-sitter Apex parsing not yet integrated (using regex patterns)
- Some complex Apex patterns may not be detected
- Flow analysis requires metadata API access

## Release Notes

### 0.0.1

Initial release:

- Apex code quality analysis
- Automation complexity detection
- Data model health checking
- Query performance risk analysis
- Weighted health scoring (0-100)
- Interactive webview dashboard
- Configurable rules engine
- Multiple export formats (HTML, JSON, Markdown)

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

## License

MIT

---

**Enjoy healthier Salesforce orgs!** 🚀

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

- Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
- Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
- Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

- [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
- [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
