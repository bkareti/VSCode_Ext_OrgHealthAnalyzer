# Salesforce Org Health Analyzer - Development Instructions

## Project Overview
This VS Code extension analyzes Salesforce org health including Apex code quality, automation complexity, data model health, and query performance.

## Architecture

### Core Components
- **Analyzers** (`src/analyzers/`): Code analysis modules
  - `apexAnalyzer.ts`: Apex class/trigger analysis
  - `automationAnalyzer.ts`: Flow/trigger/validation rule analysis
  - `queryAnalyzer.ts`: SOQL query performance analysis
  - `dataModelAnalyzer.ts`: Custom field usage analysis

- **Rules Engine** (`src/rules/`): Configurable rule system
  - `engine.ts`: Rule execution engine
  - `index.ts`: Built-in rule definitions

- **Services** (`src/services/`): External integrations
  - `salesforceService.ts`: SF CLI and API integration

- **Reports** (`src/reports/`): Report generation
  - `healthScore.ts`: Score calculation
  - `reportGenerator.ts`: HTML/JSON/Text reports

- **UI** (`src/ui/`): User interface
  - `dashboard.ts`: Webview dashboard
  - `treeProvider.ts`: Results tree view

## Development

### Build Commands
```bash
npm run compile     # Build extension
npm run watch       # Watch mode
npm run test        # Run tests
npm run lint        # Run ESLint
```

### Running the Extension
1. Press `F5` to open Extension Development Host
2. Run command: `Salesforce: Run Org Health Analyzer`

### Adding New Rules
1. Create rule in `src/rules/index.ts`
2. Register in `registerBuiltInRules()`
3. Add configuration in `package.json` if needed

## Configuration
Users can configure rules in VS Code settings under `sfHealthAnalyzer.*` or via `.sfhealthrc.json` file.
