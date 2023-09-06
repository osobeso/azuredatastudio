/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Component, Inject, forwardRef, ChangeDetectorRef } from '@angular/core';
import * as chartjs from 'chart.js';
import { mixin } from 'sql/base/common/objects';
import { Disposable } from 'vs/base/common/lifecycle';

@Component({
	selector: 'chart-component',
	templateUrl: decodeURI(require.toUrl('./chart.component.html'))
})
export class Chart extends Disposable {
	private _chartData: chartjs.ChartData;

	private _configuration: any = {
		chartTitle: 'Test Chart Please Ignore',
		datasets: [
			{
				data: [2, 3, 4],
				backgroundColor: '#FF8888',
				borderColor: '#FF0000',
				seriesLabel: 'by one'
			},
			{
				data: [3.5, 4, 4.5],
				backgroundColor: '#88FF88',
				borderColor: '#00FF00',
				seriesLabel: 'by half'
			},
			{
				data: [1, 3, 5],
				backgroundColor: '#8888FF',
				borderColor: '#0000FF',
				seriesLabel: 'by two'
			}
		],
		// only data that aligns with a label is shown.  If fewer labels than data, then data is truncated; if more labels than data, then there's an empty entry
		labels: ['un', 'deux', 'trois', 'quatre']
	};

	private _type: any;
	public chart: chartjs.Chart;

	private _options: any = {
		events: ['click', 'keyup'],
		responsive: true,
		maintainAspectRatio: false
	};

	constructor(
		@Inject(forwardRef(() => ChangeDetectorRef)) private _changeRef: ChangeDetectorRef
	) {
		chartjs.Chart.register(...chartjs.registerables);
		super();
	}

	ngAfterViewInit(): void {

	}

	public set type(val: any) {
		if (val === 'horizontalBar') {
			this._type = 'bar';
			this._options = mixin({}, mixin(this._options, { indexAxis: 'y' }));
		}
		else {
			this._type = val;
		}
		this._changeRef.detectChanges();
	}

	public set data(val: chartjs.ChartData) {
		this._chartData = val;
		console.log('chart set data');
		this.drawChart();
	}

	public set options(val: any) {
		if (val) {
			this._options = mixin({}, mixin(this._options, val));
		}
		console.log('chart set options');
		this.drawChart();
	}

	private convert(): chartjs.ChartData {
		console.log(`chart num datasets: ${this._chartData.datasets.length}`);

		const result: chartjs.ChartData = {
			datasets: []
		}

		for (let set of this._configuration.datasets) {
			result.datasets.push({
				data: 'x' in set.data ? set.data.map(val => val.x) : set.data,
				backgroundColor: set.backgroundColor,
				borderColor: set.borderColor,
				label: set.seriesLabel
			});
		}

		result.labels = this._configuration.labels;

		return result;
	}

	public drawChart() {
		if (this.chart) {
			this.chart.data = this.convert();
			this.chart.update();
		} else {
			this.chart = new chartjs.Chart("MyChart", {
				type: this._type,
				plugins: [plugin],
				data: this.convert(),
				options: this._options
			});
		}
	}
}

const setActiveElements = function (chart, index) {
	chart.setActiveElements([
		{
			datasetIndex: 0,
			index,
		}
	]);
	chart.update();
};

const currentActiveElement = function (elements) {
	if (elements.length) {
		return elements[0].index;
	}
	return -1;
};

const dispatchClick = function (chart, point) {
	const node = chart.canvas;
	const rect = node.getBoundingClientRect();
	const event = new MouseEvent('click', {
		clientX: rect.left + point.x,
		clientY: rect.top + point.y,
		cancelable: true,
		bubbles: true,
		//view: window
	});
	node.dispatchEvent(event);
}

const plugin = {
	id: 'keyup',
	defaults: {
		events: ['keyup']
	},
	beforeEvent(chart, args, options) {
		const event = args.event;
		const code = event.native.code;
		const activeElements = chart.getActiveElements();
		const tooltip = chart.tooltip;
		if (code === 'ArrowRight') {
			const pos = currentActiveElement(activeElements) + 1;
			const index = pos === chart.data.datasets[0].data.length ? 0 : pos;
			setActiveElements(chart, index);
			setActiveElements(tooltip, index);
		} else if (code === 'ArrowLeft') {
			const pos = currentActiveElement(activeElements) - 1;
			const index = pos < 0 ? chart.data.datasets[0].data.length - 1 : pos;
			setActiveElements(chart, index);
			setActiveElements(tooltip, index);
		} else if (code === 'Enter' && activeElements.length) {
			const el = activeElements[0];
			const meta = chart.getDatasetMeta(el.datasetIndex);
			const data = meta.data[el.index];
			dispatchClick(chart, data);
		}
		return false;
	}
};
