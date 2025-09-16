import { Action } from '@reduxjs/toolkit';
import { defaultFilter } from '@/queryDef';
import { ElasticsearchQuery } from '@/types';
import { initExploreQuery, initQuery } from '../../state';

import {
  addFilter,
  changeFilterField,
  changeFilterOperation,
  changeFilterValue,
  removeFilter,
  toggleFilterVisibility,
} from './actions';

export const reducer = (state: ElasticsearchQuery['filters'], action: Action): ElasticsearchQuery['filters'] => {
  // console.log('Running filters reducer with action:', action, state);

  if (addFilter.match(action)) {
    return [...state!, defaultFilter(action.payload)];
  }

  if (removeFilter.match(action)) {
    const filterToRemove = state!.find((m) => m.id === action.payload)!;
    const resultingFilters = state!.filter((filter) => filterToRemove.id !== filter.id);
    if (resultingFilters.length === 0) {
      return [defaultFilter()];
    }
    return resultingFilters;
  }

  if (changeFilterField.match(action)) {
    return state!.map((filter) => {
      if (filter.id !== action.payload.id) {
        return filter;
      }

      return {
        ...filter,
        filter: {
          ...filter.filter,
          key: action.payload.field,
        }
      };
    });
  }

  if (changeFilterOperation.match(action)) {
    return state!.map((filter) => {
      if (filter.id !== action.payload.id) {
        return filter;
      }

      return {
        ...filter,
        filter: {
          ...filter.filter,
          operator: action.payload.op,
        }
      };
    });
  }

  if (changeFilterValue.match(action)) {
    return state!.map((filter) => {
      if (filter.id !== action.payload.id) {
        return filter;
      }

      return {
        ...filter,
        filter: {
          ...filter.filter,
          value: action.payload.value,
        }
      };
    });
  }

  if (toggleFilterVisibility.match(action)) {
    return state!.map((filter) => {
      if (filter.id !== action.payload) {
        return filter;
      }

      return {
        ...filter,
        hide: !filter.hide,
      };
    });
  }

  if (initQuery.match(action) || initExploreQuery.match(action)) {
    if (state && state.length > 0) {
      return state;
    }
    return [defaultFilter()];
  }

  return state;
};
