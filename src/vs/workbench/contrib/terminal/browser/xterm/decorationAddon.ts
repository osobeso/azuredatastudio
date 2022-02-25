/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITerminalCommand } from 'vs/workbench/contrib/terminal/common/terminal';
import { IDecoration, ITerminalAddon, Terminal } from 'xterm';
import * as dom from 'vs/base/browser/dom';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { ITerminalCapabilityStore, TerminalCapability } from 'vs/workbench/contrib/terminal/common/capabilities/capabilities';
import { IColorTheme, ICssStyleCollector, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IHoverService } from 'vs/workbench/services/hover/browser/hover';
import { IAction } from 'vs/base/common/actions';
import { Emitter } from 'vs/base/common/event';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { localize } from 'vs/nls';
import { Delayer } from 'vs/base/common/async';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { fromNow } from 'vs/base/common/date';
import { toolbarHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_SUCCESS_BACKGROUND_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';

const enum DecorationSelector {
	CommandDecoration = 'terminal-command-decoration',
	ErrorColor = 'error',
	DefaultColor = 'default',
	Codicon = 'codicon',
	XtermDecoration = 'xterm-decoration',
	FirstSplitContainer = '.pane-body.integrated-terminal .terminal-group .monaco-split-view2.horizontal .split-view-view:first-child .xterm'
}

const enum DecorationStyles {
	DefaultDimension = 16,
	MarginLeftFirstSplit = -17,
	MarginLeft = -12
}

interface IDisposableDecoration { decoration: IDecoration; disposables: IDisposable[]; exitCode?: number }

export class DecorationAddon extends Disposable implements ITerminalAddon {
	protected _terminal: Terminal | undefined;
	private _hoverDelayer: Delayer<void>;
	private _commandStartedListener: IDisposable | undefined;
	private _commandFinishedListener: IDisposable | undefined;
	private _contextMenuVisible: boolean = false;
	private _decorations: Map<number, IDisposableDecoration> = new Map();
	private _placeholderDecoration: IDecoration | undefined;

	private readonly _onDidRequestRunCommand = this._register(new Emitter<string>());
	readonly onDidRequestRunCommand = this._onDidRequestRunCommand.event;

	constructor(
		private readonly _capabilities: ITerminalCapabilityStore,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super();
		this._attachToCommandCapability();
		this._register(this._contextMenuService.onDidShowContextMenu(() => this._contextMenuVisible = true));
		this._register(this._contextMenuService.onDidHideContextMenu(() => this._contextMenuVisible = false));
		this._hoverDelayer = this._register(new Delayer(this._configurationService.getValue('workbench.hover.delay')));

		this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationIcon) ||
				e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationIconSuccess) ||
				e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationIconError)) {
				this._refreshClasses();
			} else if (e.affectsConfiguration(TerminalSettingId.FontSize) || e.affectsConfiguration(TerminalSettingId.LineHeight)) {
				this.refreshLayouts();
			} else if (e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationsEnabled) && !this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationsEnabled)) {
				this._commandStartedListener?.dispose();
				this._commandFinishedListener?.dispose();
				this._clearDecorations();
			}
		});
	}

	public refreshLayouts(): void {
		this._updateLayout(this._placeholderDecoration?.element);
		for (const decoration of this._decorations) {
			this._updateLayout(decoration[1].decoration.element);
		}
	}

	private _refreshClasses(): void {
		this._updateClasses(this._placeholderDecoration?.element);
		for (const decoration of this._decorations.values()) {
			this._updateClasses(decoration.decoration.element, decoration.exitCode);
		}
	}

	private _clearDecorations(): void {
		this._placeholderDecoration?.dispose();
		this._placeholderDecoration?.marker.dispose();
		for (const value of this._decorations.values()) {
			value.decoration.dispose();
			value.decoration.marker.dispose();
			dispose(value.disposables);
		}
		this._decorations.clear();
		this.dispose();
	}

	private _attachToCommandCapability(): void {
		if (this._capabilities.has(TerminalCapability.CommandDetection)) {
			this._addCommandFinishedListener();
		} else {
			this._register(this._capabilities.onDidAddCapability(c => {
				if (c === TerminalCapability.CommandDetection) {
					this._addCommandStartedListener();
					this._addCommandFinishedListener();
				}
			}));
		}
		this._register(this._capabilities.onDidRemoveCapability(c => {
			if (c === TerminalCapability.CommandDetection) {
				this._commandStartedListener?.dispose();
				this._commandFinishedListener?.dispose();
			}
		}));
	}

	private _addCommandStartedListener(): void {
		if (this._commandStartedListener) {
			return;
		}
		const capability = this._capabilities.get(TerminalCapability.CommandDetection);
		if (!capability) {
			return;
		}
		this._commandStartedListener = capability.onCommandStarted(command => this.registerCommandDecoration(command, true));
	}


	private _addCommandFinishedListener(): void {
		if (this._commandFinishedListener) {
			return;
		}
		const capability = this._capabilities.get(TerminalCapability.CommandDetection);
		if (!capability) {
			return;
		}
		this._commandFinishedListener = capability.onCommandFinished(command => {
			if (this._placeholderDecoration?.marker.id) {
				this._decorations.delete(this._placeholderDecoration?.marker.id);
			}
			this._placeholderDecoration?.dispose();
			this.registerCommandDecoration(command);
		});
	}

	activate(terminal: Terminal): void { this._terminal = terminal; }

	registerCommandDecoration(command: ITerminalCommand, beforeCommandExecution?: boolean): IDecoration | undefined {
		if (!this._terminal) {
			return undefined;
		}
		if (!command.marker) {
			throw new Error(`cannot add a decoration for a command ${JSON.stringify(command)} with no marker`);
		}

		const decoration = this._terminal.registerDecoration({ marker: command.marker });
		if (!decoration) {
			return undefined;
		}
		decoration.onRender(element => {
			if (beforeCommandExecution) {
				this._placeholderDecoration = decoration;
			} else {
				this._decorations.set(decoration.marker.id,
					{
						decoration,
						disposables: command.exitCode === undefined ? [] : [this._createContextMenu(element, command), ...this._createHover(element, command)],
						exitCode: command.exitCode
					});
			}

			if (!element.classList.contains(DecorationSelector.Codicon)) {
				// first render
				this._updateLayout(element);
				this._updateClasses(element, command.exitCode);
			}
		});
		return decoration;
	}

	private _updateLayout(element?: HTMLElement): void {
		if (!element) {
			return;
		}
		const fontSize = this._configurationService.inspect(TerminalSettingId.FontSize).value;
		const defaultFontSize = this._configurationService.inspect(TerminalSettingId.FontSize).defaultValue;
		if (typeof fontSize === 'number' && typeof defaultFontSize === 'number') {
			const scalar = (fontSize / defaultFontSize) <= 1 ? (fontSize / defaultFontSize) : 1;

			// must be inlined to override the inlined styles from xterm
			element.style.width = `${scalar * DecorationStyles.DefaultDimension}px`;
			element.style.height = `${scalar * DecorationStyles.DefaultDimension}px`;
			element.style.fontSize = `${scalar * DecorationStyles.DefaultDimension}px`;

			// the first split terminal in the panel has more room
			if (element.closest(DecorationSelector.FirstSplitContainer)) {
				element.style.marginLeft = `${scalar * DecorationStyles.MarginLeftFirstSplit}px`;
			} else {
				element.style.marginLeft = `${scalar * DecorationStyles.MarginLeft}px`;
			}
		}
	}

	private _updateClasses(element?: HTMLElement, exitCode?: number): void {
		if (!element) {
			return;
		}
		for (const classes of element.classList) {
			element.classList.remove(classes);
		}
		element.classList.add(DecorationSelector.CommandDecoration, DecorationSelector.Codicon, DecorationSelector.XtermDecoration);
		if (exitCode === undefined) {
			element.classList.add(DecorationSelector.DefaultColor);
			element.classList.add(`codicon-${this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationIcon)}`);
		} else if (exitCode) {
			element.classList.add(DecorationSelector.ErrorColor);
			element.classList.add(`codicon-${this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationIconError)}`);
		} else {
			element.classList.add(`codicon-${this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationIconSuccess)}`);
		}
	}

	private _createContextMenu(element: HTMLElement, command: ITerminalCommand): IDisposable {
		// When the xterm Decoration gets disposed of, its element gets removed from the dom
		// along with its listeners
		return dom.addDisposableListener(element, dom.EventType.CLICK, async () => {
			this._hideHover();
			const actions = await this._getCommandActions(command);
			this._contextMenuService.showContextMenu({ getAnchor: () => element, getActions: () => actions });
		});
	}

	private _createHover(element: HTMLElement, command: ITerminalCommand): IDisposable[] {
		return [
			dom.addDisposableListener(element, dom.EventType.MOUSE_ENTER, () => {
				if (this._contextMenuVisible) {
					return;
				}
				this._hoverDelayer.trigger(() => {
					let hoverContent = `${localize('terminalPromptContextMenu', "Show Command Actions")}...`;
					hoverContent += '\n\n---\n\n';
					if (command.exitCode) {
						if (command.exitCode === -1) {
							hoverContent += localize('terminalPromptCommandFailed', 'Command executed {0} and failed', fromNow(command.timestamp, true));
						} else {
							hoverContent += localize('terminalPromptCommandFailedWithExitCode', 'Command executed {0} and failed (Exit Code {1})', fromNow(command.timestamp, true), command.exitCode);
						}
					} else {
						hoverContent += localize('terminalPromptCommandSuccess', 'Command executed {0}', fromNow(command.timestamp, true));
					}
					this._hoverService.showHover({ content: new MarkdownString(hoverContent), target: element });
				});
			}),
			dom.addDisposableListener(element, dom.EventType.MOUSE_LEAVE, () => this._hideHover()),
			dom.addDisposableListener(element, dom.EventType.MOUSE_OUT, () => this._hideHover())
		];
	}

	private _hideHover() {
		this._hoverDelayer.cancel();
		this._hoverService.hideHover();
	}

	private async _getCommandActions(command: ITerminalCommand): Promise<IAction[]> {
		const actions: IAction[] = [];
		if (command.hasOutput) {
			actions.push({
				class: 'copy-output', tooltip: 'Copy Output', dispose: () => { }, id: 'terminal.copyOutput', label: localize("terminal.copyOutput", 'Copy Output'), enabled: true,
				run: () => this._clipboardService.writeText(command.getOutput()!)
			});
		}
		actions.push({
			class: 'rerun-command', tooltip: 'Rerun Command', dispose: () => { }, id: 'terminal.rerunCommand', label: localize("terminal.rerunCommand", 'Re-run Command'), enabled: true,
			run: () => this._onDidRequestRunCommand.fire(command.command)
		});
		return actions;
	}
}

registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	const successColor = theme.getColor(TERMINAL_COMMAND_DECORATION_SUCCESS_BACKGROUND_COLOR);
	const errorColor = theme.getColor(TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR);
	const defaultColor = theme.getColor(TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR);
	const hoverBackgroundColor = theme.getColor(toolbarHoverBackground);

	if (successColor) {
		collector.addRule(`.${DecorationSelector.CommandDecoration} { color: ${successColor.toString()}; } `);
	}
	if (errorColor) {
		collector.addRule(`.${DecorationSelector.CommandDecoration}.${DecorationSelector.ErrorColor} { color: ${errorColor.toString()}; } `);
	}
	if (defaultColor) {
		collector.addRule(`.${DecorationSelector.CommandDecoration}.${DecorationSelector.DefaultColor} { color: ${defaultColor.toString()};} `);
	}
	if (hoverBackgroundColor) {
		collector.addRule(`.${DecorationSelector.CommandDecoration}:not(.${DecorationSelector.DefaultColor}):hover { background-color: ${hoverBackgroundColor.toString()}; }`);
	}
});
