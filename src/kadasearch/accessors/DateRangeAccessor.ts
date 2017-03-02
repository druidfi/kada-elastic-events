import {
  ObjectState,
  FilterBasedAccessor,
  FilterBucket,
  HistogramBucket,
  BoolMust,
  CardinalityMetric,
  FieldOptions,
  FieldContext,
  FieldContextFactory
} from "searchkit";

import { DateRangeQuery } from "../query/DateRangeQuery";

const maxBy = require("lodash/maxBy")
const get = require("lodash/get")

export interface DateRangeAccessorOptions {
  title:string
  id:string
  fromDate:number | string
  toDate:number | string
  interval?: number
  field:string,
  loadHistogram?:boolean
  fieldOptions?:FieldOptions
}

export class DateRangeAccessor extends FilterBasedAccessor<ObjectState> {
  options:any
  state = new ObjectState({})
  fieldContext:FieldContext

  constructor(key, options:DateRangeAccessorOptions){
    super(key, options.id)
    this.options = options
    this.options.fieldOptions = this.options.fieldOptions || {type:"embedded"}
    this.options.fieldOptions.field = this.options.field
    this.fieldContext = FieldContextFactory(this.options.fieldOptions)
  }

  buildSharedQuery(query) {
    if (this.state.hasValue()) {
      let val:any = this.state.getValue()
      let dateRangeFilter = this.fieldContext.wrapFilter(DateRangeQuery(this.options.field,{
        gte:val.fromDate, lte:val.toDate
      }))
      let selectedFilter = {
        name:this.translate(this.options.title),
        value:`${val.fromDate} - ${val.toDate}`,
        id:this.options.id,
        remove:()=> {
          this.state = this.state.clear()
        }
      }


      query = query
        .addFilter(this.key, dateRangeFilter)
        .addSelectedFilter(selectedFilter)

      console.log("✅✅✅ DateRangeAccessor has built a shared query!", query)

      return query

    }

    console.log("🛑🛑🛑 DateRangeAccessor has no value so no query got built")

    return query
  }

  getBuckets(){
    return this.getAggregations([
      this.key,
      this.fieldContext.getAggregationPath(),
      this.key, "buckets"], [])
  }

  isDisabled() {
    let aggs = this.getAggregations([
      this.key,
      this.fieldContext.getAggregationPath(),
      this.key, "value"], 0)

    console.log(`DateRangeAccessor got ${aggs} result aggregations!`)

    return aggs === 0
  }

  getInterval(){
    if (this.options.interval) {
      return this.options.interval
    }
    // Use full day intervals if not otherwise specificed.
    return 24*60*60*1000
  }

  buildOwnQuery(query) {
    let otherFilters = query.getFiltersWithoutKeys(this.key)
    let filters = BoolMust([
      otherFilters,
      this.fieldContext.wrapFilter(
        DateRangeQuery(this.options.field, {
          gte:this.options.fromDate, lte:this.options.toDate
        })
      )
    ])

    let metric

    if (this.options.loadHistogram) {
      metric = HistogramBucket(this.key, this.options.field, {
        "interval":this.getInterval(),
        "min_doc_count":0,
        "extended_bounds":{
          "fromDate":this.options.fromDate,
          "toDate":this.options.toDate
        }
      })
    } else {
      metric = CardinalityMetric(this.key, this.options.field)
    }

    let bucket = FilterBucket(
      this.key,
      filters,
      ...this.fieldContext.wrapAggregations(metric)
    )

    console.log("DateRangeAccessor, FilterBucket:", bucket)

    let finishedQuery = query.setAggs(bucket)

    console.log("DateRangeAccessor, final query:", finishedQuery)

    return finishedQuery
  }
}