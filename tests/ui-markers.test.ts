import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(__dirname, '../src/public/index.html'), 'utf8');

describe('Dashboard UI markers', () => {
  it('should have Users tab', () => {
    expect(html).toContain('data-testid="tab-users"');
    expect(html).toContain('data-tab="users"');
  });

  it('should have Schedules tab', () => {
    expect(html).toContain('data-testid="tab-schedules"');
    expect(html).toContain('data-tab="schedules"');
  });

  it('should have Users panel with search and table', () => {
    expect(html).toContain('id="panel-users"');
    expect(html).toContain('data-testid="panel-users"');
    expect(html).toContain('id="user-search"');
    expect(html).toContain('id="users-table"');
    expect(html).toContain('data-testid="users-table"');
  });

  it('should have Schedules panel with list', () => {
    expect(html).toContain('id="panel-schedules"');
    expect(html).toContain('data-testid="panel-schedules"');
    expect(html).toContain('id="schedules-list"');
    expect(html).toContain('data-testid="schedules-list"');
  });

  it('should have navigation tabs for all sections', () => {
    expect(html).toContain('data-tab="overview"');
    expect(html).toContain('data-tab="users"');
    expect(html).toContain('data-tab="schedules"');
    expect(html).toContain('data-tab="escalations"');
    expect(html).toContain('data-tab="services"');
    expect(html).toContain('data-tab="incidents"');
    expect(html).toContain('data-tab="integrations"');
  });

  it('should have role filter for users', () => {
    expect(html).toContain('id="user-role-filter"');
    expect(html).toContain('value="ADMIN"');
    expect(html).toContain('value="GROUP_LEADER"');
  });

  it('should include JavaScript that loads users and schedules', () => {
    expect(html).toContain('loadUsers');
    expect(html).toContain('loadSchedules');
    expect(html).toContain('/api/users');
    expect(html).toContain('/api/schedules');
  });

  it('should render schedule layers and on-call info', () => {
    expect(html).toContain('currentOnCall');
    expect(html).toContain('oncall-badge');
    expect(html).toContain('layer-row');
    expect(html).toContain('layer-members');
  });
});
