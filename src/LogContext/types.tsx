export type FieldContingency = {
  [value: string]: {
    count: number
    pinned: boolean
    active?: boolean
  };
};
export type Field = {
  name: string
  contingency: FieldContingency

};export type Filter = {
  name: string
  value: string
};

