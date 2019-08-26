import * as vscode from "vscode";
import {SerialPlotter} from "./serialPlotter";

export class SerialPlotterPanel {
    public static currentPanel: SerialPlotterPanel | void = null;
    public static serialPlotter: SerialPlotter | void = null;

    public static createOrShow({html, serialPlotter}: {html: string, serialPlotter: SerialPlotter}): void {
        if (SerialPlotterPanel.currentPanel) {
            SerialPlotterPanel.currentPanel._panel.reveal();
            return;
        }

        const panel = vscode.window.createWebviewPanel("arduinoSerialPlotter", "Arduino Serial Plotter", vscode.ViewColumn.Two, {
            enableScripts: true,
            retainContextWhenHidden: true,
        });

        panel.webview.html = html;

        SerialPlotterPanel.serialPlotter = serialPlotter;
        SerialPlotterPanel.currentPanel = new SerialPlotterPanel(panel);
    }

    private readonly _panel: vscode.WebviewPanel = null;

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel;

        this._panel.onDidDispose(() => this.dispose());

        if (SerialPlotterPanel.serialPlotter) {
            SerialPlotterPanel.serialPlotter.setSendMessageFn((msg) => panel.webview.postMessage(msg));
            SerialPlotterPanel.serialPlotter.reset();
        }
    }

    public dispose(): void {
        SerialPlotterPanel.currentPanel = undefined;
        SerialPlotterPanel.serialPlotter = undefined;

        this._panel.dispose();
    }
}
