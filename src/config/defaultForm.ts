import {FormConfig} from '../types';

/**
 * Default seed form — starts minimal (1 field).
 * Users extend it in the Form screen.
 */
export const DEFAULT_FORM: FormConfig = {
  id: 'default-form',
  name: 'Default Form',
  description: 'Minimal starter form — add fields from the Form tab.',
  version: 1,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  fields: [
    {
      id: 'note',
      type: 'textarea',
      label: 'Note',
      isEncrypted: false,
      required: false,
      placeholder: 'Add a note…',
      order: 1,
    },
  ],
};
