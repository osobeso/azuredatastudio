/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Component, Input, Inject, ChangeDetectorRef, forwardRef, OnDestroy, ElementRef, AfterViewInit, ViewChild } from '@angular/core';

import * as azdata from 'azdata';
import { ComponentBase } from 'sql/workbench/browser/modelComponents/componentBase';
import { IComponent, IComponentDescriptor, IModelStore } from 'sql/platform/dashboard/browser/interfaces';
import { Chart } from 'sql/base/browser/ui/chart/chart.component';
import { ILogService } from 'vs/platform/log/common/log';

@Component({
	selector: 'modelview-chart',
	templateUrl: decodeURI(require.toUrl('./chart.component.html'))
})

export default class ChartComponent<TConfig extends azdata.ChartConfiguration<TVal, TData, TOptions>,
	TVal extends azdata.ChartPoint,
	TData extends azdata.ChartDataSet<TVal>,
	TOptions extends azdata.ChartOptions> extends ComponentBase<azdata.ChartComponentProperties<TConfig, TVal, TData, TOptions>> implements IComponent, OnDestroy, AfterViewInit {

	@Input() descriptor: IComponentDescriptor;
	@Input() modelStore: IModelStore;

	@ViewChild(Chart) private _chart: Chart<TConfig, TVal, TData, TOptions>;

	constructor(
		@Inject(forwardRef(() => ChangeDetectorRef)) changeRef: ChangeDetectorRef,
		@Inject(forwardRef(() => ElementRef)) el: ElementRef,
		@Inject(ILogService) logService: ILogService) {
		super(changeRef, el, logService);
	}

	ngAfterViewInit(): void {
		this.baseInit();
	}

	override ngOnDestroy(): void {
		this.baseDestroy();
	}

	public override setProperties(properties: { [key: string]: any; }): void {
		super.setProperties(properties);
		if (this.chartType) {
			this._chart.type = this.chartType;
		}
		if (this.configuration) {
			this._chart.configuration = {
				chartTitle: this.configuration.chartTitle,
				options: this.configuration.options,
				datasets: this.configuration.datasets
			};
			this._chart.configuration.chartTitle = this.configuration.chartTitle;
			this._chart.configuration.options = this.configuration.options;
			this._chart.configuration.datasets = this.configuration.datasets;
		}
	}

	public get chartType(): azdata.ChartType | undefined {
		return this.getProperties().chartType ?? undefined;
	}

	public get configuration(): azdata.ChartConfiguration<TVal, TData, TOptions> | undefined {
		return this.getProperties().configuration ?? undefined;
	}

	public setLayout(layout: any): void {
		this.layout();
	}
}
