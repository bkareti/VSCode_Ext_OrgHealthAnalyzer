# Salesforce Org Health Analyzer

A VS Code extension that analyzes Salesforce org health, identifying code quality issues, automation complexity, data model problems, and query performance risks.

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

- **VS Code** 1.110.0 or higher
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
