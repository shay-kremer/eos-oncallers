import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('Dashboard HTML UI markers', () => {
  it('returns HTML with app title', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('eos-oncallers');
  });

  const requiredTabs = [
    'tab-overview',
    'tab-incidents',
    'tab-services',
    'tab-schedules',
    'tab-escalations',
    'tab-users',
    'tab-teams',
    'tab-integrations',
    'tab-status-pages',
    'tab-automation',
    'tab-analytics',
    'tab-audit',
    'tab-settings',
  ];

  for (const tab of requiredTabs) {
    it(`has ${tab} marker`, async () => {
      const res = await request(app).get('/');
      expect(res.text).toContain(tab);
    });
  }

  const requiredPanels = [
    'panel-overview',
    'panel-incidents',
    'panel-services',
    'panel-schedules',
    'panel-escalations',
    'panel-users',
    'panel-teams',
    'panel-integrations',
    'panel-status-pages',
    'panel-automation',
    'panel-analytics',
    'panel-audit',
    'panel-settings',
  ];

  for (const panel of requiredPanels) {
    it(`has ${panel} panel`, async () => {
      const res = await request(app).get('/');
      expect(res.text).toContain(panel);
    });
  }

  it('contains incident action functions (ack/resolve)', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('ackIncident');
    expect(res.text).toContain('resolveIncident');
  });

  it('contains loadUsers and loadSchedules functions', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('loadUsers');
    expect(res.text).toContain('loadSchedules');
  });

  it('contains loadTeams function', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('loadTeams');
  });

  it('contains loadAnalytics function', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('loadAnalytics');
  });

  it('contains loadSettings function', async () => {
    const res = await request(app).get('/');
    expect(res.text).toContain('loadSettings');
  });


  describe('Security: no credentials in HTML', () => {
    it('does not contain hardcoded passwords', async () => {
      const res = await request(app).get('/');
      expect(res.text).not.toContain('admin123');
      expect(res.text).not.toContain('user123');
    });

    it('does not display "Dev credentials" text with password', async () => {
      const res = await request(app).get('/');
      expect(res.text).not.toMatch(/Dev credentials.*admin123/);
      expect(res.text).not.toMatch(/password.*admin123/i);
    });

    it('does not expose any password-like patterns in login page', async () => {
      const res = await request(app).get('/');
      // Should not have any visible password value in the HTML source
      expect(res.text).not.toMatch(/\/\s*<\/code>/);
    });
  });

});
