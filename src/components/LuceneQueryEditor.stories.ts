import type { Meta, StoryObj } from '@storybook/react';

import { LuceneQueryEditor } from './LuceneQueryEditor';

const meta: Meta<typeof LuceneQueryEditor> = {
  title: 'components/LuceneQueryEditor',
  component: LuceneQueryEditor,
};

export default meta;
type Story = StoryObj<typeof LuceneQueryEditor>;

export const Base: Story = {};
