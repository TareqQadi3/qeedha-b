import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { ImportPage } from '../ImportPage';

const hasPermission = vi.fn();

vi.mock('../../state/auth', () => ({
  useAuth: () => ({ hasPermission }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ImportPage />
    </MemoryRouter>,
  );
}

describe('ImportPage', () => {
  it('shows an error banner instead of the wizard when the member lacks import.create', () => {
    hasPermission.mockImplementation(() => false);
    renderPage();
    expect(screen.getByText('لا تملك صلاحية استيراد البيانات من Excel')).toBeInTheDocument();
  });

  it('loads entity types and the upload form when the member has import.create', async () => {
    hasPermission.mockImplementation((key: string) => key === 'import.create' || key === 'import.read');
    vi.spyOn(client.api, 'get').mockImplementation((path: string) => {
      if (path === '/imports/entity-types') {
        return Promise.resolve([
          {
            entityType: 'products',
            fields: [
              { field: 'sku', label: 'SKU', required: true },
              { field: 'name', label: 'اسم المنتج', required: true },
            ],
          },
        ]);
      }
      if (path === '/tenancy/warehouses') return Promise.resolve([]);
      if (path === '/imports/jobs') return Promise.resolve({ data: [], meta: { total: 0 } });
      return Promise.resolve({});
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('رفع الملف ومتابعة')).toBeInTheDocument());
    expect(screen.getByText(/الحقول المطلوبة/)).toBeInTheDocument();
    // Upload is disabled until a file is actually chosen (no mock-data submission path).
    expect(screen.getByText('رفع الملف ومتابعة')).toBeDisabled();
  });
});
