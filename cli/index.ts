#!/usr/bin/env node
// ============================================================
// Design Pattern Multiverse — CLI
// ============================================================

import { program } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import ora from 'ora';
import { nanoid } from 'nanoid';

import {
  searchPatterns,
  getPattern,
  putPattern,
  addFeedback,
  getStats,
  scoutAll,
  scoutSource,
  interpretSubmission,
  generateCode,
  assessQuality,
  initSONA,
  learnFromFeedback,
  getSONAStats,
  indexPattern,
  searchVectors,
  getAllIds,
  assignTaxonomy,
  type DesignPattern,
  type PatternQuery,
  type CodeGenRequest,
  type PatternSubmission,
} from '../src/index.js';

// Banner
function showBanner(): void {
  console.log(
    chalk.cyan(figlet.textSync('DPM', { font: 'Big', horizontalLayout: 'full' }))
  );
  console.log(chalk.dim('  Design Pattern Multiverse — v0.1.0\n'));
  console.log(chalk.dim('  Self-learning design pattern research & code generation\n'));
}

// ============================================================
// CLI Setup
// ============================================================

program
  .name('dpm')
  .description('Design Pattern Multiverse — self-learning design pattern research & code generation')
  .version('0.1.0')
  .option('-v, --verbose', 'Enable verbose logging (debug level)')
  .hook('preAction', (thisCommand) => {
    // Set log level from --verbose flag
    if (thisCommand.opts().verbose) {
      process.env.DPM_LOG_LEVEL = 'debug';
    }
    initSONA({ adaptationRate: 0.15 });
  });

// ----------------------------------------------------------
// search
// ----------------------------------------------------------
program
  .command('search')
  .description('Search the pattern library')
  .argument('<query>', 'Search query (e.g. "dark mode dashboard")')
  .option('-l, --limit <number>', 'Max results', '10')
  .option('-s, --source <source>', 'Filter by source')
  .option('-f, --framework <framework>', 'Filter by framework')
  .option('--layout <type>', 'Filter by layout type')
  .option('--min-quality <score>', 'Minimum quality score 0-10')
  .action(async (query, options) => {
    showBanner();
    const spinner = ora('Searching...').start();

    try {
      const pq: PatternQuery = {
        text: query,
        limit: parseInt(options.limit),
        source: options.source as any,
        framework: options.framework as any,
        layoutType: options.layout as any,
        minQuality: options.minQuality ? parseFloat(options.minQuality) : undefined,
      };

      const results = await searchPatterns(pq);
      spinner.stop();

      if (results.length === 0) {
        console.log(chalk.yellow('\n  No patterns found. Try:'));
        console.log(chalk.dim('    dpm discover "' + query + '"'));
        return;
      }

      console.log(chalk.green(`\n  Found ${results.length} patterns\n`));
      for (const r of results.slice(0, parseInt(options.limit))) {
        const p = r.pattern;
        const qualityColor = p.qualityScore >= 7 ? chalk.green :
                             p.qualityScore >= 4 ? chalk.yellow : chalk.red;
        console.log(`  ${chalk.bold(p.title)}`);
        console.log(`  ${chalk.dim(p.description.slice(0, 100))}`);
        console.log(`  ${chalk.blue('Layout:')} ${p.layout.type}  ${chalk.blue('Components:')} ${p.components.slice(0, 4).join(', ')}`);
        console.log(`  ${chalk.blue('Quality:')} ${qualityColor('★'.repeat(Math.round(p.qualityScore / 2)))} ${p.qualityScore}/10`);
        console.log(`  ${chalk.blue('Source:')} ${p.source}  ${chalk.blue('ID:')} ${chalk.dim(p.id)}`);
        const colorValues = Object.values(p.colors).filter((c): c is string => typeof c === 'string' && c.startsWith('#')).slice(0, 3);
        console.log(`  ${chalk.blue('Colors:')} ${colorValues.map(c => chalk.hex(c)('██')).join(' ')}`);
        console.log();
      }
    } catch (error) {
      spinner.stop();
      console.error(chalk.red('  Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// ----------------------------------------------------------
// discover
// ----------------------------------------------------------
program
  .command('discover')
  .description('Research the internet for design patterns')
  .argument('<query>', 'What to search for')
  .option('-s, --sources <sources>', 'Comma-separated sources (pinterest,dribbble,behance,figma)', 'all')
  .option('--save', 'Automatically save results to library')
  .action(async (query, options) => {
    showBanner();

    const sources = options.sources === 'all'
      ? ['pinterest', 'dribbble', 'behance', 'figma-community']
      : options.sources.split(',').map((s: string) => s.trim());

    console.log(chalk.blue(`  Researching "${query}" across ${sources.length} sources...\n`));

    for (const source of sources) {
      const spinner = ora(`  Searching ${chalk.cyan(source)}...`).start();
      const result = await scoutSource(source as any, query);
      spinner.stop();

      console.log(`  ${chalk.green('✓')} ${chalk.bold(source)}: ${result.submissions.length} found`);
      for (const sub of result.submissions.slice(0, 3)) {
        console.log(`    ${chalk.dim('•')} ${sub.title}`);
      }
      if (result.submissions.length > 3) {
        console.log(`    ${chalk.dim(`  ... and ${result.submissions.length - 3} more`)}`);
      }
      if (result.errors.length > 0) {
        console.log(`    ${chalk.yellow('⚠')} ${result.errors[0]}`);
      }
      console.log();
    }

    if (options.save) {
      const spinner = ora('Saving discovered patterns to library...').start();
      for (const source of sources) {
        const result = await scoutSource(source as any, query);
        for (const sub of result.submissions) {
          try {
            const vision = await interpretSubmission(sub);
            const pattern: DesignPattern = {
              id: `pat_${nanoid(12)}`,
              source: sub.source,
              url: sub.url,
              title: sub.title ?? 'Untitled',
              description: sub.description ?? '',
              imageUrl: sub.imageUrl,
              layout: vision.layout,
              colors: vision.colors,
              typography: vision.typography,
              components: vision.components,
              frameworkHints: ['react'],
              tags: sub.tags ?? [],
              qualityScore: 5,
              embedding: [],
              feedback: [],
              metadata: {},
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            const quality = await assessQuality(pattern);
            pattern.qualityScore = quality.score;
            await putPattern(pattern);
            await indexPattern(pattern);
          } catch {
            // skip failed
          }
        }
      }
      spinner.succeed(`Saved patterns to library`);
    }
  });

// ----------------------------------------------------------
// submit
// ----------------------------------------------------------
program
  .command('submit')
  .description('Submit a new pattern to the library')
  .requiredOption('-s, --source <source>', 'Source (pinterest, dribbble, etc.)')
  .requiredOption('-u, --url <url>', 'Original URL')
  .requiredOption('-t, --title <title>', 'Pattern title')
  .option('-d, --description <desc>', 'Description')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--image <url>', 'Image URL')
  .action(async (options) => {
    showBanner();
    const spinner = ora('Processing pattern...').start();

    const submission: PatternSubmission = {
      source: options.source,
      url: options.url,
      title: options.title,
      description: options.description ?? '',
      imageUrl: options.image ?? '',
      tags: options.tags?.split(',').map((t: string) => t.trim()).filter(Boolean) ?? [],
    };

    try {
      const vision = await interpretSubmission(submission);
      const pattern: DesignPattern = {
        id: `pat_${nanoid(12)}`,
        source: submission.source,
        url: submission.url,
        title: submission.title ?? 'Untitled',
        description: submission.description ?? '',
        imageUrl: submission.imageUrl,
        layout: vision.layout,
        colors: vision.colors,
        typography: vision.typography,
        components: vision.components,
        frameworkHints: ['react'],
        tags: submission.tags ?? [],
        qualityScore: 5,
        embedding: [],
        feedback: [],
        metadata: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const taxonomy = assignTaxonomy(pattern);
      pattern.tags = [...new Set([...pattern.tags, ...taxonomy.tags])];
      const quality = await assessQuality(pattern);
      pattern.qualityScore = quality.score;
      await putPattern(pattern);
      await indexPattern(pattern);

      spinner.succeed(chalk.green('Pattern saved!'));

      console.log(`\n  ${chalk.bold(pattern.title)}`);
      console.log(`  ${chalk.dim('ID:')} ${pattern.id}`);
      console.log(`  ${chalk.dim('Layout:')} ${pattern.layout.type}`);
      console.log(`  ${chalk.dim('Category:')} ${taxonomy.primaryCategory}`);
      console.log(`  ${chalk.dim('Quality:')} ${quality.score}/10`);
      console.log(`  ${chalk.dim('Components:')} ${pattern.components.join(', ')}`);
      console.log(`  ${chalk.dim('Colors:')} ${Object.values(pattern.colors).filter(c => typeof c === 'string' && c.startsWith('#')).slice(0, 4).map(c => chalk.hex(c)('██')).join(' ')}`);
      console.log(`  ${chalk.dim('Typography:')} ${pattern.typography.heading.family} / ${pattern.typography.body.family}`);
      console.log();

      if (quality.suggestions.length > 0) {
        console.log(chalk.yellow('  Suggestions:'));
        quality.suggestions.forEach(s => console.log(`    ${chalk.dim('•')} ${s}`));
        console.log();
      }
    } catch (e: any) {
      spinner.fail(chalk.red(`Error: ${e.message}`));
    }
  });

// ----------------------------------------------------------
// get
// ----------------------------------------------------------
program
  .command('get')
  .description('Get pattern details by ID')
  .argument('<id>', 'Pattern ID')
  .action(async (id) => {
    showBanner();
    const spinner = ora('Fetching pattern...').start();
    const pattern = await getPattern(id);
    spinner.stop();

    if (!pattern) {
      console.log(chalk.red(`\n  Pattern not found: ${id}`));
      return;
    }

    console.log(`\n  ${chalk.bold(pattern.title)}`);
    console.log(`  ${chalk.dim(pattern.description)}`);
    console.log();
    console.log(`  ${chalk.blue('ID:')}       ${pattern.id}`);
    console.log(`  ${chalk.blue('Source:')}   ${pattern.source}`);
    console.log(`  ${chalk.blue('URL:')}      ${pattern.url}`);
    console.log(`  ${chalk.blue('Quality:')}  ${pattern.qualityScore}/10`);
    console.log();
    console.log(`  ${chalk.blue('Layout:')}   ${pattern.layout.type}`);
    console.log(`  ${chalk.blue('Zones:')}    ${pattern.layout.zones.join(', ')}`);
    console.log();
    console.log(`  ${chalk.blue('Colors:')}`);
    for (const [key, value] of Object.entries(pattern.colors)) {
      if (typeof value === 'string' && value.startsWith('#')) {
        console.log(`    ${chalk.hex(value)('██')} ${key}: ${value}`);
      }
    }
    console.log();
    console.log(`  ${chalk.blue('Typography:')}`);
    console.log(`    Heading: ${pattern.typography.heading.family} ${pattern.typography.heading.weight} (${pattern.typography.heading.size})`);
    console.log(`    Body:    ${pattern.typography.body.family} ${pattern.typography.body.weight} (${pattern.typography.body.size})`);
    console.log();
    console.log(`  ${chalk.blue('Components:')} ${pattern.components.join(', ')}`);
    console.log(`  ${chalk.blue('Framework:')}  ${pattern.frameworkHints.join(', ')}`);
    console.log(`  ${chalk.blue('Tags:')}       ${pattern.tags.join(', ')}`);
    console.log(`  ${chalk.blue('Feedback:')}   ${pattern.feedback.length} ratings`);
    console.log();
  });

// ----------------------------------------------------------
// rate
// ----------------------------------------------------------
program
  .command('rate')
  .description('Rate a pattern (triggers self-learning)')
  .argument('<id>', 'Pattern ID')
  .requiredOption('-r, --rating <1-5>', 'Rating 1-5 stars')
  .option('-t, --tags <tags>', 'Comma-separated reason tags')
  .option('-c, --comment <text>', 'Optional comment')
  .action(async (id, options) => {
    showBanner();
    const rating = parseInt(options.rating);
    if (rating < 1 || rating > 5) {
      console.log(chalk.red('  Rating must be 1-5'));
      return;
    }

    const spinner = ora('Recording feedback...').start();
    const tags = options.tags?.split(',').map((t: string) => t.trim()).filter(Boolean) ?? [];
    const success = await addFeedback(id, { rating, tags, comment: options.comment });
    if (!success) {
      spinner.fail(chalk.red(`Pattern not found: ${id}`));
      return;
    }

    await learnFromFeedback(id, rating, tags);
    spinner.succeed('Feedback recorded!');

    const pattern = await getPattern(id);
    console.log(`\n  Pattern "${pattern?.title}" now rated ${rating}/5`);
    console.log(`  New quality score: ${pattern?.qualityScore}/10`);
    console.log(`  SONA learned patterns: ${getSONAStats().learnedPatterns}`);
    console.log();
  });

// ----------------------------------------------------------
// code
// ----------------------------------------------------------
program
  .command('code')
  .description('Generate component code from a pattern')
  .argument('<id>', 'Pattern ID')
  .option('-f, --framework <framework>', 'Target framework (react, vue)', 'react')
  .option('--style <style>', 'CSS approach', 'tailwind')
  .option('--no-typescript', 'Use JavaScript instead of TypeScript')
  .option('--tests', 'Include test files')
  .option('-o, --output <dir>', 'Output directory', './generated')
  .action(async (id, options) => {
    showBanner();
    const pattern = await getPattern(id);
    if (!pattern) {
      console.log(chalk.red(`\n  Pattern not found: ${id}`));
      return;
    }

    const spinner = ora('Generating code...').start();
    const request: CodeGenRequest = {
      patternId: id,
      framework: options.framework,
      style: options.style,
      options: {
        typescript: options.typescript,
        includeTests: options.tests,
      },
    };

    const result = await generateCode(request);
    spinner.succeed(`Generated ${result.files.length} files`);

    console.log(`\n  ${chalk.bold('Pattern:')} ${pattern.title}`);
    console.log(`  ${chalk.bold('Framework:')} ${result.framework}`);
    console.log();
    console.log(`  ${chalk.blue('Generated files:')}`);
    for (const file of result.files) {
      console.log(`    ${chalk.green('📄')} ${file.path} (${file.content.length} chars)`);
    }
    console.log();
    console.log(chalk.dim(`  Use --output <dir> to write files to disk`));
    console.log();
  });

// ----------------------------------------------------------
// stats
// ----------------------------------------------------------
program
  .command('stats')
  .description('Show library statistics')
  .action(async () => {
    showBanner();
    const spinner = ora('Gathering stats...').start();
    const [stats, sonaStats] = await Promise.all([getStats(), Promise.resolve(getSONAStats())]);
    spinner.stop();

    console.log(`  ${chalk.bold('Library Statistics')}`);
    console.log();
    console.log(`  ${chalk.blue('Total patterns:')}    ${stats.totalPatterns}`);
    console.log(`  ${chalk.blue('Avg quality:')}       ${stats.averageQuality.toFixed(1)}/10`);
    console.log(`  ${chalk.blue('Total feedback:')}    ${stats.totalFeedback}`);
    console.log();

    console.log(`  ${chalk.blue('By Source:')}`);
    for (const [source, count] of Object.entries(stats.totalSources)) {
      const bar = chalk.green('█'.repeat(Math.max(1, count)));
      console.log(`    ${source.padEnd(16)} ${bar} ${count}`);
    }
    console.log();

    console.log(`  ${chalk.blue('Top Layouts:')}`);
    stats.topLayouts.slice(0, 5).forEach(l => {
      console.log(`    ${l.type.padEnd(20)} ${l.count}`);
    });
    console.log();

    console.log(`  ${chalk.blue('Top Components:')}`);
    stats.topComponents.slice(0, 5).forEach(c => {
      console.log(`    ${c.type.padEnd(20)} ${c.count}`);
    });
    console.log();

    console.log(`  ${chalk.blue('SONA Learning:')}`);
    console.log(`    Learned patterns: ${sonaStats.learnedPatterns}`);
    console.log(`    Sources tracked:  ${sonaStats.sourcesTracked}`);
    console.log(`    Affinities:       ${sonaStats.componentAffinities}`);
    console.log();
  });

// ----------------------------------------------------------
// suggest
// ----------------------------------------------------------
program
  .command('suggest')
  .description('Get AI-powered design pattern suggestions')
  .argument('<context>', 'Describe what you are building')
  .option('-l, --limit <number>', 'Number of suggestions', '5')
  .action(async (context, options) => {
    showBanner();
    const spinner = ora(`Analyzing context: "${context}"...`).start();
    const limit = parseInt(options.limit);

    const results = await searchPatterns({ text: context, limit });
    const vectorResults = await searchVectors(context, limit);

    const suggestions = new Map<string, DesignPattern>();
    for (const r of results) suggestions.set(r.pattern.id, r.pattern);
    for (const vr of vectorResults) {
      if (!suggestions.has(vr.id)) {
        const p = await getPattern(vr.id);
        if (p) suggestions.set(vr.id, p);
      }
    }

    spinner.stop();

    if (suggestions.size === 0) {
      console.log(chalk.yellow('\n  No suggestions yet. Try:'));
      console.log(chalk.dim('    dpm discover "' + context + '" --save'));
      return;
    }

    const patterns = Array.from(suggestions.values()).slice(0, limit);
    console.log(chalk.green(`\n  ${patterns.length} suggestions for "${context}"\n`));

    for (const p of patterns) {
      console.log(`  ${chalk.bold(p.title)}`);
      console.log(`    ${chalk.dim(p.description.slice(0, 100))}`);
      console.log(`    ${chalk.blue('Layout:')} ${p.layout.type}  ${chalk.blue('Quality:')} ${p.qualityScore}/10`);
      console.log(`    ${chalk.dim(p.id)}`);
      console.log();
    }
  });

// ----------------------------------------------------------
// seed — Seed with example patterns
// ----------------------------------------------------------
program
  .command('seed')
  .description('Seed the library with example design patterns')
  .action(async () => {
    showBanner();
    const spinner = ora('Seeding library with example patterns...').start();

    const examples: PatternSubmission[] = [
      { source: 'pinterest', url: 'https://pinterest.com/pin/dash-101', title: 'Modern Analytics Dashboard', description: 'Full analytics dashboard with charts, KPIs, and data tables organized in cards', tags: ['dashboard', 'analytics', 'modern', 'data'] },
      { source: 'dribbble', url: 'https://dribbble.com/shots/landing-202', title: 'SaaS Landing Page', description: 'Hero section with gradient background, value proposition, CTA, and feature grid below', tags: ['landing', 'saas', 'hero', 'gradient'] },
      { source: 'behance', url: 'https://behance.net/gallery/auth-flow', title: 'Authentication Flow', description: 'Complete auth flow: login, signup, password reset with clean card-based layout', tags: ['auth', 'login', 'signup', 'security'] },
      { source: 'pinterest', url: 'https://pinterest.com/pin/ecom-001', title: 'E-commerce Product Page', description: 'Product page with image gallery, variant selector, add to cart, and reviews section', tags: ['ecommerce', 'product', 'shop', 'conversion'] },
      { source: 'dribbble', url: 'https://dribbble.com/shots/dark-dash', title: 'Dark Mode Dashboard', description: 'Full dark theme dashboard with neon accents, charts, and data sidebar', tags: ['dark', 'dashboard', 'neon', 'analytics'] },
      { source: 'figma-community', url: 'https://figma.com/community/file/pricing', title: 'Pricing Page Blocks', description: 'Three-tier pricing comparison with feature lists, highlighted recommended plan, and FAQ', tags: ['pricing', 'comparison', 'saas', 'conversion'] },
      { source: 'pinterest', url: 'https://pinterest.com/pin/form-202', title: 'Multi-step Onboarding', description: 'Step-by-step onboarding form with progress indicator, illustrations, and skip option', tags: ['onboarding', 'form', 'multi-step', 'ux'] },
      { source: 'behance', url: 'https://behance.net/gallery/settings-ui', title: 'Settings Page Design', description: 'Organized settings layout with sections, toggles, dropdowns, and save indicators', tags: ['settings', 'configuration', 'form', 'ux'] },
      { source: 'dribbble', url: 'https://dribbble.com/shots/nav-patterns', title: 'Navigation Patterns Collection', description: 'Collection of responsive navigation patterns: top nav, sidebar, mega menu, mobile drawer', tags: ['navigation', 'navbar', 'sidebar', 'responsive'] },
      { source: 'pinterest', url: 'https://pinterest.com/pin/chat-ui', title: 'Messaging Interface', description: 'Clean chat UI with message bubbles, typing indicator, contact list, and search', tags: ['chat', 'messaging', 'social', 'communication'] },
    ];

    let count = 0;
    for (const sub of examples) {
      try {
        const vision = await interpretSubmission(sub);
        const pattern: DesignPattern = {
          id: `pat_seed_${nanoid(8)}`,
          source: sub.source,
          url: sub.url,
          title: sub.title ?? 'Untitled',
          description: sub.description ?? '',
          layout: vision.layout,
          colors: vision.colors,
          typography: vision.typography,
          components: vision.components,
          frameworkHints: ['react'],
          tags: sub.tags ?? [],
          qualityScore: 5,
          embedding: [],
          feedback: [],
          metadata: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const taxonomy = assignTaxonomy(pattern);
        pattern.tags = [...new Set([...pattern.tags, ...taxonomy.tags])];
        const quality = await assessQuality(pattern);
        pattern.qualityScore = quality.score;
        await putPattern(pattern);
        await indexPattern(pattern);
        count++;
      } catch {
        // skip
      }
    }

    spinner.succeed(chalk.green(`Seeded ${count} example patterns!`));
    const sonaStats = getSONAStats();
    console.log(`\n  ${chalk.dim(`SONA learning: ${sonaStats.learnedPatterns} patterns tracked`)}`);
    console.log(`  ${chalk.dim('Try:')}  dpm search "dashboard"`);
    console.log(`  ${chalk.dim('      ')} dpm suggest "building a fintech app"`);
    console.log(`  ${chalk.dim('      ')} dpm code <pattern-id>`);
    console.log();
  });

// ============================================================
// Parse
// ============================================================

program.parse(process.argv);

// Show help if no args
if (process.argv.length < 3) {
  showBanner();
  program.help();
}
