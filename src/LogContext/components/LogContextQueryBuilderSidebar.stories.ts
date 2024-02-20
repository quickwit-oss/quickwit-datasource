import type { Meta, StoryObj } from '@storybook/react';

import { LogContextQueryBuilderSidebar } from './LogContextQueryBuilderSidebar';

const meta: Meta<typeof LogContextQueryBuilderSidebar> = {
  title: 'LogContext/LogContextQueryBuilderSidebar',
  component: LogContextQueryBuilderSidebar,
  // This component will have an automatically generated Autodocs entry: https://storybook.js.org/docs/writing-docs/autodocs
  // tags: ['autodocs'],
  parameters: {
    // More on Story layout: https://storybook.js.org/docs/configure/story-layout
    // layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof LogContextQueryBuilderSidebar>;

export const Base: Story = {
  args: {
    fields: [
      {name:"filter1", contingency:{
        "value1": {count:5, pinned:false, active:false},
        "value2": {count:10, pinned:false, active:true},
        "value3": {count:15, pinned:false, active:false},
      }}
    ]
  }
};
