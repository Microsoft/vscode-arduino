export const chartConfig = {
    chart: {
        zoomType: "x",
    },
    title: {
        text: "Serial Plotter",
    },
    boost: {
        enabled: true,
        useGPUTranslations: true,
    },
    xAxis: {
        type: "datetime",
        crosshair: true,
        title: {
            text: "Time",
        },
    },
    yAxis: {
        title: {
            text: "Value",
        },
    },
    series: {
        marker: {
            enabled: false,
        },
    },
    tooltip: {
        animation: false,
        split: true,
        xDateFormat: "%H:%M:%S.%L",
    },
    legend: {
        layout: "vertical",
        align: "right",
        verticalAlign: "middle",
        title: {
            text: "Legend",
        },
    },
    plotOptions: {
        series: {
            showInNavigator: true,
        },
    },
    rangeSelector: {
        buttons: [
            {
                count: 10,
                type: "second",
                text: "10s",
            },
            {
                count: 30,
                type: "second",
                text: "30s",
            },
            {
                count: 1,
                type: "minute",
                text: "1m",
            },
            {
                type: "all",
                text: "All",
            },
        ],
        inputEnabled: false,
        selected: 0,
    },
};
