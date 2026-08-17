import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import * as client from '../../api/client';
import { QeedhaIntegrationPage } from '../QeedhaIntegrationPage';

const hasPermission = vi.fn();

vi.mock('../../state/auth', () => ({
  useAuth: () => ({ hasPermission }),
}));

function renderPage() {
  return render(<QeedhaIntegrationPage />);
}

describe('QeedhaIntegrationPage', () => {
  it('شاشة بلا صلاحية integration.read تعرض رسالة رفض ولا تستدعي الواجهة', () => {
    hasPermission.mockImplementation(() => false);
    const getSpy = vi.spyOn(client.api, 'get');

    renderPage();

    expect(screen.getByText('لا تملك صلاحية عرض تكامل قيّدها')).toBeInTheDocument();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('حالة غير مرتبط: تعرض شارة "غير مرتبط" وزر الربط لمن يملك integration.manage فقط', async () => {
    hasPermission.mockImplementation((key: string) => ['integration.read', 'integration.manage'].includes(key));
    vi.spyOn(client.api, 'get').mockResolvedValue({
      status: 'not_connected',
      publicReference: null,
      secretLastFour: null,
      connectedAt: null,
      lastVerifiedAt: null,
      revokedAt: null,
    });

    renderPage();

    expect(await screen.findByText('غير مرتبط')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ربط التكامل' })).toBeInTheDocument();
  });

  it('عضوية بلا integration.manage: لا تُعرض أزرار الربط أو القطع، مع رسالة توضيحية', async () => {
    hasPermission.mockImplementation((key: string) => key === 'integration.read');
    vi.spyOn(client.api, 'get').mockResolvedValue({
      status: 'not_connected',
      publicReference: null,
      secretLastFour: null,
      connectedAt: null,
      lastVerifiedAt: null,
      revokedAt: null,
    });

    renderPage();

    await screen.findByText('غير مرتبط');
    expect(screen.queryByRole('button', { name: 'ربط التكامل' })).not.toBeInTheDocument();
    expect(screen.getByText('لا تملك صلاحية إدارة تكامل قيّدها (ربط/قطع اتصال)')).toBeInTheDocument();
  });

  it('الربط ينجح ويعرض المرجع العام والسر مرة واحدة فقط، ثم يختفي بعد إعادة تحميل الحالة', async () => {
    hasPermission.mockImplementation((key: string) => ['integration.read', 'integration.manage'].includes(key));
    vi.spyOn(client.api, 'get').mockResolvedValue({
      status: 'not_connected',
      publicReference: null,
      secretLastFour: null,
      connectedAt: null,
      lastVerifiedAt: null,
      revokedAt: null,
    });
    const postSpy = vi.spyOn(client.api, 'post').mockResolvedValue({
      status: 'connected',
      publicReference: 'qic_abc123',
      secretLastFour: 'wxyz',
      secret: 'super-secret-raw-value',
      connectedAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      revokedAt: null,
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'ربط التكامل' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledWith('/qeedha-integration/connection'));
    expect(await screen.findByText('super-secret-raw-value')).toBeInTheDocument();
    expect(screen.getAllByText('qic_abc123').length).toBeGreaterThan(0);
    expect(screen.getByText(/يُعرض مرة واحدة فقط/)).toBeInTheDocument();
    expect(await screen.findByText('متصل')).toBeInTheDocument();
  });

  it('حالة متصل تعرض زر قطع الاتصال، ويتطلب تأكيدًا قبل استدعاء DELETE', async () => {
    hasPermission.mockImplementation((key: string) => ['integration.read', 'integration.manage'].includes(key));
    vi.spyOn(client.api, 'get').mockResolvedValue({
      status: 'connected',
      publicReference: 'qic_abc123',
      secretLastFour: 'wxyz',
      connectedAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      revokedAt: null,
    });
    const deleteSpy = vi.spyOn(client.api, 'delete').mockResolvedValue({
      status: 'disabled',
      publicReference: 'qic_abc123',
      secretLastFour: 'wxyz',
      connectedAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      revokedAt: new Date().toISOString(),
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'قطع الاتصال' }));
    expect(screen.getByText(/تأكيد قطع اتصال تكامل قيّدها/)).toBeInTheDocument();
    expect(deleteSpy).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'تأكيد القطع' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('/qeedha-integration/connection'));
    expect(await screen.findByText('موقوف')).toBeInTheDocument();
  });

  it('تعرض رسالة خطأ عند فشل تحميل حالة الربط', async () => {
    hasPermission.mockImplementation((key: string) => ['integration.read', 'integration.manage'].includes(key));
    vi.spyOn(client.api, 'get').mockRejectedValue(new client.ApiError('تعذّر تحميل حالة تكامل قيّدها', 500));

    renderPage();

    expect(await screen.findByText('تعذّر تحميل حالة تكامل قيّدها')).toBeInTheDocument();
  });
});
