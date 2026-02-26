const vscode = require('vscode');

let autoAcceptInterval = null;
let enabled = true;
let statusBarItem;
let outputChannel;

// Commands to try accepting — all Antigravity accept commands + key general ones
const ACCEPT_COMMANDS = [
    // Antigravity-specific accepts
    'antigravity.agent.acceptAgentStep',              // Accept individual agent step
    'antigravity.terminalCommand.accept',             // Accept terminal command
    'antigravity.command.accept',                     // Accept command
    'antigravity.acceptCompletion',                   // Accept code completion
    'antigravity.prioritized.agentAcceptAllInFile',   // Accept all changes in current file
    'antigravity.prioritized.agentAcceptFocusedHunk', // Accept focused hunk
    'antigravity.prioritized.supercompleteAccept',    // Accept supercomplete suggestion
    // General accepts
    'chatEditing.acceptAllFiles',                     // Accept all file changes from chat
    'notification.acceptPrimaryAction',               // Accept notification prompts
    'inlineChat.acceptChanges',                       // Accept inline chat suggestions
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
    } catch (e) {
        log(`❌ Failed to discover commands: ${e.message}`);
    }
}

function activate(context) {
    // Create output channel for debugging
    outputChannel = vscode.window.createOutputChannel('Auto-Accept Debug');
    context.subscriptions.push(outputChannel);
    // Output channel available but not forced open (use 'Auto-Accept Debug' in Output panel to view)

    log('🚀 Auto-Accept All extension v1.6.0 activated!');

    // Register toggle command
    let disposable = vscode.commands.registerCommand('antigravity-auto-accept-all.toggle', function () {
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
    context.subscriptions.push(disposable);

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
