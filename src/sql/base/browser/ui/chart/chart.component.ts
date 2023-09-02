/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Component, Inject, forwardRef, ChangeDetectorRef } from '@angular/core';
import * as chartjs from 'chart.js';
import { mixin } from 'sql/base/common/objects';
import { Disposable } from 'vs/base/common/lifecycle';
import { ChartDataSet, ChartPoint, ChartConfiguration, ChartOptions } from 'azdata';

@Component({
	selector: 'chart-component',
	templateUrl: decodeURI(require.toUrl('./chart.component.html'))
})

//export class Chart<T extends ChartOptions> extends Disposable {
export class Chart<TConfig extends ChartConfiguration<TVal, TData, TOptions>,
	TVal extends ChartPoint,
	TData extends ChartDataSet<TVal>,
	TOptions extends ChartOptions> extends Disposable {
	private _type: any;
	private _configuration: TConfig;
	public chart: any;

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

	public set configuration(val: any) {
		if (val) {
			this._configuration = mixin({}, mixin(this._configuration, val));
		}

		this.drawChart();
	}

	public set options(val: any) {
		if (val) {
			this._options = mixin({}, mixin(this._options, val));
		}
		this.drawChart();
	}

	private convert(): chartjs.ChartData {
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

		return result;
	}

	public drawChart() {
		this.chart = new chartjs.Chart(this._configuration.chartTitle, {
			type: this._type,
			plugins: [plugin],
			data: this.convert(),
			options: this._options,
		});
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
