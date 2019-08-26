import * as React from "react";
import { Button, ControlLabel, FormControl, FormGroup } from "react-bootstrap";
import * as API from "../actions/api";
import { chartConfig } from "./chartConfig";

import Dygraph from "dygraphs";

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

interface ISerialPlotterState extends React.Props<any> {
    rate: number;
    active: boolean;
    timeWindow: number;
}

const formatTime = (time: number) => {
    const date = new Date(time);

    const hh = date.getUTCHours().toString().padStart(2, "0");
    const mm = date.getUTCMinutes().toString().padStart(2, "0");
    const ss = date.getUTCSeconds().toString().padStart(2, "0");
    const mss = date.getUTCMilliseconds().toString().padStart(3, "0");

    return `${hh}:${mm}:${ss}.${mss}`;
};

const getFrameLabels = (msg: IMessageFrame) =>
    Object.keys(msg).filter((label) => !["time", "type"].includes(label));

class SerialPlotter extends React.Component<React.Props<void>, ISerialPlotterState> {
    public static INITIAL_THROTTLING = 100;
    public static INITIAL_TIME_WINDOW = 1000 * 20;

    public state = {
        rate: SerialPlotter.INITIAL_THROTTLING,
        timeWindow: SerialPlotter.INITIAL_TIME_WINDOW,
        active: false,
    };

    private _graph: Dygraph = null;
    private _data: number[][] = null;
    private _lastValues: { [field: string]: number } = null;
    private _labels: string[] = null;
    private _timeWindow: number = SerialPlotter.INITIAL_TIME_WINDOW;

    private _ref: HTMLElement = null;

    public componentDidMount() {
        this.initMessageHandler();
        this.initChart();

        window.addEventListener("resize", this.handleResize, true);
    }

    public render() {
        return (
            <div className="serialplotter">
                <div>
                    <div className="graph" ref={(el) => (this._ref = el)} />
                </div>
                <div className="settings">
                    <div>
                        <div className="section">
                            <div className="parameters">
                                <FormGroup>
                                    <ControlLabel>Refresh rate</ControlLabel>
                                    <FormControl
                                        type="number"
                                        value={this.state.rate}
                                        onChange={this.onRateChange}
                                    />
                                </FormGroup>

                                <FormGroup>
                                    <ControlLabel>Time window</ControlLabel>
                                    <FormControl
                                        type="number"
                                        value={this.state.timeWindow}
                                        onChange={this.onTimeWindowChange}
                                    />
                                </FormGroup>
                            </div>
                            <Button
                                bsSize="small"
                                onClick={this.applyPlotSettings}
                            >
                                Apply
                            </Button>
                        </div>
                    </div>

                    <div>
                        <div className="section">
                            <Button bsSize="small" onClick={this.reset}>
                                Reset
                            </Button>
                            <Button
                                bsSize="small"
                                onClick={
                                    this.state.active ? this.pause : this.play
                                }
                            >
                                {this.state.active ? "Pause" : "Play"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    private initChart() {
        if (this._graph) {
            this._graph.destroy();
        }

        this._labels = [];
        this._graph = new Dygraph(this._ref, [[0, 0]], {
            labels: this._labels,
            legend: "always",
            showRangeSelector: true,
            connectSeparatedPoints: true,
            drawGapEdgePoints: true,
            axes: {
                x: {
                    valueFormatter: formatTime,
                    axisLabelFormatter: formatTime,
                },
            },
        });

        this._data = [];
        this._lastValues = {};
    }

    private getFrameValues(msg: IMessageFrame, labels: string[]) {
        return labels.map((label) => {
            const value = msg[label] as number;

            if (typeof value !== "undefined") {
                this._lastValues[label] = value;

                return value;
            }

            return this._lastValues[label] || null;
        });
    }

    private getDataTimeWindow(time: number) {
        const start = Math.max(0, time - this._timeWindow);
        const startIdx = this._data.findIndex((data) => data[0] > start);
        const timeWindowData = this._data.slice(startIdx);

        return timeWindowData;
    }

    private updateChart() {
        this._graph.updateOptions({
            file: this._data,
            labels: ["time", ...this._labels],
        });
    }

    private addFrame(msg: IMessageFrame) {
        if (!this._graph) {
            return;
        }

        const labels = [...new Set([...this._labels, ...getFrameLabels(msg)])];
        const values = this.getFrameValues(msg, labels);

        const time = msg.time;
        const frameData = [time, ...values];

        this._data = [...this.getDataTimeWindow(time), frameData];
        this._labels = labels;

        this.updateChart();
    }

    private doAction(msg: IMessageAction) {
        if (msg.action === Action.Reset) {
            this.reset();
        }
    }

    private play = () => {
        this.setState({
            active: true,
        });
    }

    private pause = () => {
        this.setState({
            active: false,
        });
    }

    private reset = () => {
        this.initChart();
    }

    private initMessageHandler() {
        window.addEventListener("message", (event) => {
            if (!this.state.active) {
                return;
            }

            const data: IMessage = event.data;

            switch (data.type) {
                case MessageType.Frame:
                    this.addFrame(data as IMessageFrame);
                    break;
                case MessageType.Action:
                    this.doAction(data as IMessageAction);
                    break;
                default:
                    console.warn("Unknown message type", data);
            }
        });

        this.setState({
            active: true,
        });
    }

    private applyPlotSettings = () => {
        API.updatePlotRefreshRate(this.state.rate);

        this._timeWindow = this.state.timeWindow;

        const lastData = this._data[this._data.length - 1];
        const lastTime = lastData[0];

        this._data = this.getDataTimeWindow(lastTime);

        this.updateChart();
    }

    private onRateChange = (e) => {
        this.setState({
            rate: e.target.value,
        });
    }

    private onTimeWindowChange = (e) => {
        this.setState({
            timeWindow: e.target.value,
        });
    }

    private handleResize() {
        (this._graph as any).resize();
    }
}

export default SerialPlotter;
