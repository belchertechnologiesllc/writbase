/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentKeyDetailEditor } from '../agent-key-detail-editor';

const updateMock = vi.fn();
vi.mock('@/app/(dashboard)/actions/agent-key-actions', () => ({
  updateAgentKeyAction: (fd: FormData) => updateMock(fd),
  rotateAgentKeyAction: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function lastSent(): FormData {
  return updateMock.mock.calls.at(-1)?.[0] as FormData;
}

describe('AgentKeyDetailEditor', () => {
  afterEach(() => {
    cleanup();
    updateMock.mockReset();
  });

  function renderEditor(initialActive: boolean) {
    updateMock.mockResolvedValue({ success: true });
    render(
      <AgentKeyDetailEditor
        keyId="key-1"
        initialName="Helper Bot"
        initialPrompt=""
        initialActive={initialActive}
      />,
    );
  }

  it('does not send the on/off value when only the name changed', async () => {
    renderEditor(false);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed Bot' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });
    expect(lastSent().get('name')).toBe('Renamed Bot');
    expect(lastSent().has('isActive')).toBe(false);
  });

  it('sends the on/off value when the switch was flipped', async () => {
    renderEditor(false);

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });
    expect(lastSent().get('isActive')).toBe('true');
  });

  it('sends a later switch-off after an earlier switch-on was saved', async () => {
    renderEditor(false);

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledTimes(2);
    });
    expect(lastSent().get('isActive')).toBe('false');
  });
});
