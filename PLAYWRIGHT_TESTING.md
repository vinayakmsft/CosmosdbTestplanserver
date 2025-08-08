# Playwright Testing Setup

This repository now includes a comprehensive Playwright configuration for automated browser testing, specifically optimized for Microsoft services authentication flows.

## 📁 Files Created

- `playwright.config.ts` - Main Playwright configuration
- `tests/global-setup.ts` - Global setup that runs before all tests
- `tests/global-teardown.ts` - Global teardown that runs after all tests
- Updated `package.json` with Playwright scripts
- Updated `.gitignore` with Playwright output directories

## 🚀 Available Scripts

### Basic Test Execution
```bash
npm run test              # Run all tests
npm run test:headed       # Run tests in headed mode (see browser)
npm run test:debug        # Run tests in debug mode
npm run test:ui           # Open Playwright UI for interactive testing
```

### Browser-Specific Testing
```bash
npm run test:chromium     # Run tests only in Chromium
npm run test:edge         # Run tests only in Microsoft Edge
npm run test:firefox      # Run tests only in Firefox
```

### Reports and Results
```bash
npm run test:report       # Open the HTML test report
```

## 🔧 Configuration Features

### Browser Support
- **Chromium** - Primary browser for Microsoft services
- **Microsoft Edge** - Recommended for Microsoft authentication
- **Firefox** - Alternative browser testing
- **Mobile Chrome & Safari** - Mobile device testing

### Test Features
- **Screenshots** on failure
- **Video recording** on failure
- **Tracing** for debugging
- **HTML reports** with detailed results
- **Parallel execution** for faster testing
- **Retry mechanism** for flaky tests

### Microsoft Services Optimization
- Optimized timeouts for authentication flows (30 minutes)
- Specific browser arguments for Microsoft services
- Locale and timezone configuration
- HTTPS error handling for development environments

## 📊 Test Reports

After running tests, you can view detailed reports:
- HTML Report: `playwright-report/index.html`
- JSON Results: `test-results/results.json`
- Screenshots: `test-results/`
- Videos: `test-results/`

## 🔐 Authentication Testing

The current configuration is optimized for testing Microsoft Account authentication flows, including:
- Microsoft Login pages
- Multi-factor authentication
- "Stay signed in" dialogs
- Workspace dashboard verification

## 🎯 Current Test Suite

The repository includes a comprehensive Microsoft Account authentication test (`tests/sample.spec.ts`) that validates:
- Landing page navigation
- Authentication flow initiation
- Username and password entry
- Optional "Stay signed in" handling
- Workspace dashboard verification

## 💡 Usage Examples

### Run the Microsoft Account test
```bash
npm run test
```

### Run with visible browser (helpful for debugging)
```bash
npm run test:headed
```

### Debug a specific test
```bash
npm run test:debug -- --grep "Microsoft Account Login"
```

### Run only on Edge browser
```bash
npm run test:edge
```

### Open interactive UI
```bash
npm run test:ui
```

## 🛠️ Customization

You can customize the configuration by editing `playwright.config.ts`:
- Adjust timeouts for your specific needs
- Add or remove browser projects
- Modify reporter settings
- Configure global setup/teardown logic
- Add environment-specific settings

## 🔍 Debugging

For debugging failed tests:
1. Use `npm run test:headed` to see the browser
2. Use `npm run test:debug` for step-by-step debugging
3. Check the HTML report for detailed failure information
4. Review screenshots and videos in `test-results/`
5. Use the trace viewer for detailed execution analysis

## 📝 Notes

- The configuration includes optimizations for Microsoft services
- Authentication tests may require valid credentials (configured in test files)
- Global setup and teardown files are available for custom initialization
- The configuration supports both CI/CD and local development environments
