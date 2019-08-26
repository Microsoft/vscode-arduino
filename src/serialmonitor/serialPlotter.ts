import * as throttle from "lodash.throttle";
import * as vscode from "vscode";

import { VscodeSettings } from "../arduino/vscodeSettings";
import { SerialPortCtrl } from "./serialportctrl";

enum MessageType {
    Frame = "Frame",
    Action = "Action",
}

enum Action {
    Reset = "Reset",
}

interface IMessage {
    type: MessageType;
}

interface IMessageFrame extends IMessage {
    type: typeof MessageType.Frame;
    time?: number;
    [field: string]: string | number;
}

interface IMessageAction extends IMessage {
    type: typeof MessageType.Action;
    action: Action;
}

type ISendMessage = (message: IMessage) => void;

export class SerialPlotter implements vscode.Disposable {
    public static DEFAULT_THROTTLING: number = 100;

    private _throttling: number = SerialPlotter.DEFAULT_THROTTLING;
    private _frame: IMessageFrame = null;
    private _sendMessage: ISendMessage = null;

    private disposableOnLineHandler: vscode.Disposable = null;
    private sendFrame: () => void = null;

    constructor() {
        this.setThrottling(SerialPlotter.DEFAULT_THROTTLING);
        this.emptyFrame();
    }

    public open() {
        vscode.commands.executeCommand("arduino.showSerialPlotter");
    }

    public reset() {
        this.setThrottling(SerialPlotter.DEFAULT_THROTTLING);
        this.sendMessage({type: MessageType.Action, action: Action.Reset} as IMessageAction);

        this.emptyFrame();
    }

    public dispose() {
        this._sendMessage = undefined;
        this._frame = undefined;

        if (this.disposableOnLineHandler) {
            this.disposableOnLineHandler.dispose();
            this.disposableOnLineHandler = undefined;
        }
    }

    public setSendMessageFn(sendMessage: ISendMessage) {
        this._sendMessage = sendMessage;
    }

    public setSerialPortCtrl(serialPortCtrl: SerialPortCtrl) {
        if (this.disposableOnLineHandler) {
            this.disposableOnLineHandler.dispose();
        }

        this.disposableOnLineHandler = serialPortCtrl.onLine(this.handleSerialLine.bind(this));
    }

    public setThrottling(throttling: number): void {
        this._throttling = throttling;
        this.sendFrame = throttle(this._sendFrame, this._throttling, { leading: false });
    }

    private _sendFrame() {
        if (!this._frame) {
            return;
        }

        this.sendMessage(this._frame);
        this.emptyFrame();
    }

    private sendMessage(msg: IMessage) {
        if (!this._sendMessage) {
            return;
        }

        this._sendMessage(msg);
    }

    private handleSerialLine(line: string): void {
        const match = line.match(new RegExp(VscodeSettings.getInstance().plotterRegex));

        if (!match) {
            return;
        }

        const [, time, field, value] = match;

        this._frame = {
            ...this._frame,
            type: MessageType.Frame,
            time: parseInt(time, 10),
            [field]: parseFloat(value),
        };

        this.sendFrame();
    }

    private emptyFrame() {
        this._frame = {type: MessageType.Frame};
    }
}
