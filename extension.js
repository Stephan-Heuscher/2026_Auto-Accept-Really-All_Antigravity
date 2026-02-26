const vscode = require('vscode');

let autoAcceptInterval = null;
let enabled = true;
let debugRunning = false;
let statusBarItem;
let outputChannel;

// Commands to try accepting — Tier 1 (Agent & Core) + Tier 2 (UI Dialogs & Prompts)
const ACCEPT_COMMANDS = [
    // === Tier 1: Agent & Core (most important, fire first) ===
    'antigravity.agent.acceptAgentStep',              // Accept individual agent step
    'antigravity.terminalCommand.accept',             // Accept terminal command
    'antigravity.command.accept',                     // Accept command
    'antigravity.acceptCompletion',                   // Accept code completion
    'antigravity.prioritized.agentAcceptAllInFile',   // Accept all changes in current file
    'antigravity.prioritized.agentAcceptFocusedHunk', // Accept focused hunk
    'antigravity.prioritized.supercompleteAccept',    // Accept supercomplete suggestion
    'chatEditing.acceptAllFiles',                     // Accept all file changes from chat
    'chatEditing.acceptFile',                         // Accept single file change from chat
    'inlineChat.acceptChanges',                       // Accept inline chat suggestions

    // === Tier 2: UI Dialogs & Prompts ===
    'quickInput.accept',                              // Accept any open quick-pick/input dialog
    'quickInput.acceptInBackground',                  // Accept quick-input without closing
    'notification.acceptPrimaryAction',               // Accept notification prompts
    'workbench.action.acceptSelectedQuickOpenItem',   // Accept selected quick-open item
    'workbench.action.alternativeAcceptSelectedQuickOpenItem', // Alt-accept quick-open item
];

function log(msg) {
    const timestamp = new Date().toISOString().slice(11, 23);
    outputChannel.appendLine(`[${timestamp}] ${msg}`);
}

async function discoverAcceptCommands() {
    try {
        const allCommands = await vscode.commands.getCommands(true);
        const acceptRelated = allCommands.filter(c =>
            c.toLowerCase().includes('accept') ||
            c.toLowerCase().includes('approve') ||
            c.toLowerCase().includes('agent')
        );
        log('=== DISCOVERED COMMANDS (accept/approve/agent related) ===');
        acceptRelated.sort().forEach(c => log(`  📌 ${c}`));
        log(`=== Total: ${acceptRelated.length} commands ===`);
        log('');

        // Also log our configured commands and whether they exist
        log('=== CONFIGURED COMMANDS STATUS ===');
        for (const cmd of ACCEPT_COMMANDS) {
            const exists = allCommands.includes(cmd);
            log(`  ${exists ? '✅' : '❌'} ${cmd} — ${exists ? 'EXISTS' : 'NOT FOUND'}`);
        }
        log('================================');
        log('');
        return acceptRelated.sort();
    } catch (e) {
        log(`❌ Failed to discover commands: ${e.message}`);
        return [];
    }
}

// ============================================================
// DEBUG: Sequential test — fires ALL discovered accept commands
// one by one with delays so you can see which one dismisses
// the terminal execution OK dialog.
// ============================================================
async function debugSequentialTest() {
    if (debugRunning) {
        log('⚠️ Debug test already running, skipping');
        return;
    }
    debugRunning = true;

    // Pause auto-accept loop during debug
    const wasEnabled = enabled;
    enabled = false;
    updateStatusBar();

    // Show the output channel so user can watch live
    outputChannel.show(true);

    log('');
    log('🔬 ═══════════════════════════════════════════════════════');
    log('🔬  DEBUG SEQUENTIAL TEST');
    log('🔬  Firing ALL accept commands one by one...');
    log('🔬  Watch which command dismisses your dialog!');
    log('🔬  The one that triggers will show ✅ or cause a change.');
    log('🔬 ═══════════════════════════════════════════════════════');
    log('');

    // Get all discovered accept-related commands
    const allCommands = await vscode.commands.getCommands(true);
    const acceptCommands = allCommands.filter(c =>
        c.toLowerCase().includes('accept')
    ).sort();

    log(`📋 Testing ${acceptCommands.length} accept commands...\n`);

    for (let i = 0; i < acceptCommands.length; i++) {
        const cmd = acceptCommands[i];
        const num = String(i + 1).padStart(2, ' ');
        try {
            log(`  [${num}/${acceptCommands.length}] 🔄 FIRING: ${cmd}`);
            const result = await vscode.commands.executeCommand(cmd);
            if (result !== undefined && result !== null) {
                log(`  [${num}/${acceptCommands.length}] ✅ ← RETURNED VALUE: ${JSON.stringify(result)}`);
            } else {
                log(`  [${num}/${acceptCommands.length}] ⚪ ← no return value`);
            }
        } catch (e) {
            log(`  [${num}/${acceptCommands.length}] ❌ ← ERROR: ${e.message}`);
        }
        // 500ms delay between commands so you can see which one worked
        await new Promise(r => setTimeout(r, 500));
    }

    log('');
    log('🔬 ═══════════════════════════════════════════════════════');
    log('🔬  DEBUG TEST COMPLETE');
    log('🔬  Check above: the command that dismissed your dialog');
    log('🔬  is the one right BEFORE the dialog disappeared.');
    log('🔬 ═══════════════════════════════════════════════════════');
    log('');

    // Restore auto-accept state
    enabled = wasEnabled;
    updateStatusBar();
    debugRunning = false;
}

function activate(context) {
    // Create output channel for debugging
    outputChannel = vscode.window.createOutputChannel('Auto-Accept Debug');
    context.subscriptions.push(outputChannel);

    log('🚀 Auto-Accept All extension v1.8.0 activated!');

    // Register toggle command
    let toggleDisposable = vscode.commands.registerCommand('antigravity-auto-accept-all.toggle', function () {
        enabled = !enabled;
        updateStatusBar();
        if (enabled) {
            log('▶️ Auto-Accept ENABLED by user');
            vscode.window.showInformationMessage('Auto-Accept: ON ✅');
        } else {
            log('⏸️ Auto-Accept DISABLED by user');
            vscode.window.showInformationMessage('Auto-Accept: OFF 🛑');
        }
    });
    context.subscriptions.push(toggleDisposable);

    // Register debug test command
    let debugDisposable = vscode.commands.registerCommand('antigravity-auto-accept-all.debugTest', function () {
        log('🔬 Debug test triggered by user');
        vscode.window.showInformationMessage('🔬 Debug: Testing all accept commands sequentially...');
        debugSequentialTest();
    });
    context.subscriptions.push(debugDisposable);

    try {
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10000);
        statusBarItem.command = 'antigravity-auto-accept-all.toggle';
        context.subscriptions.push(statusBarItem);

        updateStatusBar();
        statusBarItem.show();
    } catch (e) {
        log(`⚠️ Status bar creation failed: ${e.message}`);
    }

    // Discover available commands (runs async in background)
    discoverAcceptCommands();

    // Start the loop
    startLoop();
}

function updateStatusBar() {
    if (!statusBarItem) return;

    if (enabled) {
        statusBarItem.text = "✅ Auto-Accept All: ON";
        statusBarItem.tooltip = "Unlimited Auto-Accept is Executing (Click to Pause)";
        statusBarItem.backgroundColor = undefined;
    } else {
        statusBarItem.text = "🛑 Auto-Accept All: OFF";
        statusBarItem.tooltip = "Unlimited Auto-Accept is Paused (Click to Resume)";
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
}

let loopCount = 0;

function startLoop() {
    autoAcceptInterval = setInterval(async () => {
        if (!enabled) return;

        loopCount++;
        const shouldLogDetail = (loopCount % 30 === 1); // Log details every ~10 seconds

        // Fire all accept commands
        for (const cmd of ACCEPT_COMMANDS) {
            try {
                const result = await vscode.commands.executeCommand(cmd);
                if (result !== undefined && result !== null) {
                    log(`✅ ${cmd} → returned: ${JSON.stringify(result)}`);
                } else if (shouldLogDetail) {
                    log(`⚪ ${cmd} → executed (no return value)`);
                }
            } catch (e) {
                log(`❌ ${cmd} → ERROR: ${e.message}`);
            }
        }
    }, 300); // Faster polling for quicker response
}

function deactivate() {
    if (autoAcceptInterval) {
        clearInterval(autoAcceptInterval);
    }
    if (outputChannel) {
        log('👋 Auto-Accept All extension deactivated');
    }
}

module.exports = {
    activate,
    deactivate
}
