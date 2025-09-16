import { createAction } from '@reduxjs/toolkit';

import { QueryFilter } from '@/types';

export const addFilter = createAction<QueryFilter['id']>('@filters/add');
export const removeFilter = createAction<QueryFilter['id']>('@filters/remove');
export const toggleFilterVisibility = createAction<QueryFilter['id']>('@filters/toggle_visibility');
export const changeFilterField = createAction<{ id: QueryFilter['id']; field: string }>('@filters/change_field');
export const changeFilterValue = createAction<{ id: QueryFilter['id']; value: string }>('@filters/change_value');
export const changeFilterOperation = createAction<{ id: QueryFilter['id']; op: string }>('@filters/change_operation');
