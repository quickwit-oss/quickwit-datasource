import { DataFrame, DataQueryRequest, DataQueryResponse } from "@grafana/data";
import { Observable,pipe, map, from, toArray, lastValueFrom } from "rxjs";
import { BaseQuickwitDataSourceConstructor } from "./base";
import { ElasticsearchQuery, MetricAggregationWithSettings } from "types";

// DataQueryRequest modifiers

function limitLogRequest(request: DataQueryRequest<ElasticsearchQuery>, limit: number){
  request.targets = request.targets.map((t)=>{
    if (t.metrics){
      t.metrics = t.metrics.map((m)=>{
        if (m.type === 'logs'){
          m.settings = {...m.settings, limit: limit.toString()}
        }
        return m
      })
    }
    return t
  })
  return request;
}

function addSearchAfter(request: DataQueryRequest<ElasticsearchQuery>, searchAfterValues: {[key: string]: any}) {
  request.targets = request.targets.map((t)=>{
    if (t.metrics){
      const metricAgg = t.metrics[0] as  MetricAggregationWithSettings
      metricAgg.settings = {...metricAgg.settings, searchAfter: searchAfterValues[t.refId]}
    }
    return t
  })
  return request
}

function getSearchAfterValues(response: DataQueryResponse){
  const searchAfterValues: {[key: string]: any} = {};
  response.data.forEach((df: DataFrame)=>{
    if (df.meta?.custom){
      const sortValues = df.fields.find(f=>f.name==='sort')?.values
      if (sortValues && sortValues.length > 0) {
        searchAfterValues[df.refId!] = sortValues[sortValues.length -1]
      }
    }
  })
  return searchAfterValues
}

function getResponseWithNextRequest(request: DataQueryRequest, limit: number) {
  return pipe(map((response: DataQueryResponse)=>{
    let next: DataQueryRequest | null = null;

    const searchAfterValues = getSearchAfterValues(response);
    if (Object.entries(searchAfterValues).length > 0){
      next = addSearchAfter(limitLogRequest(request, limit), searchAfterValues)
      console.log("Next request", next)
    }
    return{response, next}
  }))
}

// DataQueryResponses dataframes merging

function mergeResponses(responses: DataQueryResponse[]): DataQueryResponse{

  const mergedPartial: {[key: string]: DataFrame} = {}
  responses.reduce((built, response: DataQueryResponse)=>{
    const newDataFrames = response.data
    newDataFrames.forEach((newdf: DataFrame)=>{
      if (!newdf.refId) { console.warn("Can't process dataframes without refId"); return }
      if (newdf.length === 0) {return} // Can't merge empty

      let builtdf;
      if ((builtdf = built[newdf.refId]) === undefined) {
        built[newdf.refId] = newdf
      }
      else {
        extendDataFrame(builtdf, newdf)
      }
    })
    return built
  }, mergedPartial)
  const finalResponse: DataQueryResponse = {
    ...responses[0],
    data:Object.values(mergedPartial)
  }
  console.log("Final Response", finalResponse)
  return finalResponse
}

function extendDataFrame(base: DataFrame, appendix: DataFrame) {
  base.length += appendix.length
  base.fields.forEach((baseField)=>{
    const sameField = appendix.fields.find(apdxField=>apdxField.name === baseField.name)!
    baseField.values = [...baseField.values, ...sameField.values]
    if (baseField.nanos){
      baseField.nanos = [...baseField.nanos, ...sameField.nanos!]
    }
  })
  return base
}


const DEFAULT_LIMIT = 100;

// Datasource mixin

export function withSizeLimitedLogsRequests(limit=DEFAULT_LIMIT){
  return function <TBase extends BaseQuickwitDataSourceConstructor>(Base: TBase){
    return class extends Base {
      getLimitedRequestIterable(request: DataQueryRequest){
        const doQuery = (request: DataQueryRequest)=>{
          return super.query(request)
        }
        return {
          [Symbol.asyncIterator](): AsyncIterator<DataQueryResponse> {
            let nextRequest: DataQueryRequest | null = limitLogRequest(request, limit);
            return {
              next() {
                if (!nextRequest) {return Promise.resolve({done:true, value:null})}
                return lastValueFrom(doQuery(nextRequest).pipe(
                  getResponseWithNextRequest(request, limit),
                  map((res) => {
                    nextRequest = res.next
                    return {done: false, value: res.response}
                  })
                ))
              }
            }
          }
        }
      }

      query(request: DataQueryRequest<ElasticsearchQuery>): Observable<DataQueryResponse>{
        /** Query fixed-size pages of logs until the selected timerange is exhausted
         */

        const metrics = request.targets[0].metrics;
        if (metrics && metrics[0].type !== 'logs') {
          return super.query(request)
        }
        const limitedQueries = from(this.getLimitedRequestIterable(request))
        return limitedQueries.pipe(toArray<DataQueryResponse>(), map(mergeResponses))
      }
    }
  }
}
