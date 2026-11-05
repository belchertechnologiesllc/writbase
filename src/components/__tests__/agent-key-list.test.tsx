/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentKeyList } from '../agent-key-list';

const decideMock = vi.fn();
vi.mock('@/app/(dashboard)/actions/agent-key-actions', () => ({
  decideAgentKeyApprovalAction: (...args: unknown[]) => decideMock(...args),
  createAgentKeyAction: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function mockFetch(data: unknown) {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ data }),
    }),
  ) as unknown as typeof globalThis.fetch;
}

const sampleKeys = [
  {
    id: 'key-1',
    name: 'CI Bot',
    role: 'worker' as const,
    key_prefix: 'wb_abc',
    is_active: true,
    special_prompt: null,
    created_at: '2025-01-01T00:00:00Z',
    last_used_at: '2025-06-01T12:00:00Z',
    created_by: 'user-1',
  },
  {
    id: 'key-2',
    name: 'Deploy Agent',
    role: 'manager' as const,
    key_prefix: 'wb_xyz',
    is_active: false,
    special_prompt: null,
    created_at: '2025-02-01T00:00:00Z',
    last_used_at: null,
    created_by: 'user-1',
  },
];

describe('AgentKeyList', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})) as unknown as typeof globalThis.fetch,
    );

    render(<AgentKeyList />);

    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('renders agent key rows when data loads', async () => {
    vi.stubGlobal('fetch', mockFetch(sampleKeys));

    render(<AgentKeyList />);

    await waitFor(() => {
      expect(screen.getByText('CI Bot')).toBeInTheDocument();
    });

    expect(screen.getByText('Deploy Agent')).toBeInTheDocument();
    expect(screen.getByText('worker')).toBeInTheDocument();
    expect(screen.getByText('manager')).toBeInTheDocument();
    // "Active" appears in both the table header and the badge
    const activeElements = screen.getAllByText('Active');
    expect(activeElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('renders empty state when no keys', async () => {
    vi.stubGlobal('fetch', mockFetch([]));

    render(<AgentKeyList />);

    await waitFor(() => {
      expect(screen.getByText(/No agent keys yet/)).toBeInTheDocument();
    });
  });

  it('renders key prefix with ellipsis', async () => {
    vi.stubGlobal('fetch', mockFetch(sampleKeys));

    render(<AgentKeyList />);

    await waitFor(() => {
      expect(screen.getByText('wb_abc...')).toBeInTheDocument();
      expect(screen.getByText('wb_xyz...')).toBeInTheDocument();
    });
  });

  it('renders Manage links for each key', async () => {
    vi.stubGlobal('fetch', mockFetch(sampleKeys));

    render(<AgentKeyList />);

    await waitFor(() => {
      const manageLinks = screen.getAllByText('Manage');
      expect(manageLinks).toHaveLength(2);
      expect(manageLinks[0].closest('a')).toHaveAttribute('href', '/agent-keys/key-1');
      expect(manageLinks[1].closest('a')).toHaveAttribute('href', '/agent-keys/key-2');
    });
  });

  it('renders Create Key button', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})) as unknown as typeof globalThis.fetch,
    );

    render(<AgentKeyList />);

    expect(screen.getByText('Create Key')).toBeInTheDocument();
  });
});

const pendingKey = {
  id: 'key-3',
  name: 'Helper Bot',
  role: 'worker' as const,
  key_prefix: 'wb_pnd',
  is_active: false,
  pending_approval: true,
  special_prompt: null,
  created_at: '2025-03-01T00:00:00Z',
  last_used_at: null,
  created_by: 'agent-1',
};

describe('AgentKeyList pending approvals', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    decideMock.mockReset();
  });

  it('does not show the approval section when nothing is pending', async () => {
    vi.stubGlobal('fetch', mockFetch(sampleKeys));

    render(<AgentKeyList />);

    await waitFor(() => {
      expect(screen.getByText('CI Bot')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Waiting for approval/)).not.toBeInTheDocument();
  });

  it('lists pending keys with Approve and Reject, and marks them Pending in the table', async () => {
    vi.stubGlobal('fetch', mockFetch([...sampleKeys, pendingKey]));

    render(<AgentKeyList />);

    const section = await screen.findByRole('region', { name: /Waiting for approval \(1\)/ });
    expect(within(section).getByText('Helper Bot')).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Approve Helper Bot' })).toBeInTheDocument();
    expect(within(section).getByRole('button', { name: 'Reject Helper Bot' })).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('approves a key and refreshes the list', async () => {
    const fetchMock = mockFetch([pendingKey]);
    vi.stubGlobal('fetch', fetchMock);
    decideMock.mockResolvedValue({ success: true });

    render(<AgentKeyList />);

    fireEvent.click(await screen.findByRole('button', { name: 'Approve Helper Bot' }));

    await waitFor(() => {
      expect(decideMock).toHaveBeenCalledWith('key-3', 'approve');
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  it('asks for confirmation before rejecting, and does nothing if cancelled', async () => {
    vi.stubGlobal('fetch', mockFetch([pendingKey]));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<AgentKeyList />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reject Helper Bot' }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(decideMock).not.toHaveBeenCalled();
  });

  it('rejects a key once confirmed', async () => {
    vi.stubGlobal('fetch', mockFetch([pendingKey]));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    decideMock.mockResolvedValue({ success: true });

    render(<AgentKeyList />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reject Helper Bot' }));

    await waitFor(() => {
      expect(decideMock).toHaveBeenCalledWith('key-3', 'reject');
    });
  });
});
