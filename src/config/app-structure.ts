export interface IFeature {
  key: string;
  name: string;
  featureType: 'PRIME' | 'GRID';
}

export interface IPage {
  key: string;
  name: string;
  route: string;
  icon?: string;
  component?: string;
  menu_title?: string;
  menu_order?: number;
  show_in_menu?: boolean;
  features?: IFeature[];
}

export interface IModule {
  key: string;
  name: string;
  description?: string;
  icon?: string;
  sort_order?: number;
  pages: IPage[];
}

export interface ICore {
  key: string;
  name: string;
  description?: string;
  icon?: string;
  sort_order?: number;
  modules: IModule[];
}

export const APP_STRUCTURE: ICore[] = [
  {
    key: 'my_hub',
    name: 'My Hub',
    description: 'Personal, employee-centric launcher',
    sort_order: 1,
    modules: [
      {
        key: 'my_hub_general',
        name: 'General',
        sort_order: 1,
        pages: [
          { 
            key: 'overview', 
            name: 'Overview', 
            route: '/my-hub', 
            menu_title: 'Overview', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'profile', 
            name: 'My Profile', 
            route: '/my-hub/profile', 
            menu_title: 'My Profile', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'apply_leave', 
            name: 'Apply Leave', 
            route: '/my-hub/apply-leave', 
            menu_title: 'Apply Leave', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'attendance', 
            name: 'Attendance', 
            route: '/my-hub/attendance', 
            menu_title: 'Attendance', 
            menu_order: 4,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'escalations', 
            name: 'Escalations', 
            route: '/my-hub/escalations', 
            menu_title: 'Escalations', 
            menu_order: 5,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'performance', 
            name: 'Performance Report', 
            route: '/my-hub/performance', 
            menu_title: 'Performance Report', 
            menu_order: 6,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'payslips', 
            name: 'My Payslips', 
            route: '/my-hub/payslips', 
            menu_title: 'My Payslips', 
            menu_order: 7,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'claims', 
            name: 'My Claims', 
            route: '/my-hub/claims', 
            menu_title: 'My Claims', 
            menu_order: 8,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      }
    ]
  },
  {
    key: 'home',
    name: 'Home',
    sort_order: 2,
    modules: [
      {
        key: 'home_general',
        name: 'General',
        sort_order: 1,
        pages: [
          { 
            key: 'dashboard', 
            name: 'Dashboard', 
            route: '/dashboard', 
            menu_title: 'Dashboard', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'integrations', 
            name: 'Integrations', 
            route: '/integrations', 
            menu_title: 'Integrations', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'dashboard_settings', 
            name: 'Dashboard Settings', 
            route: '/dashboard/settings', 
            menu_title: 'Dashboard Settings', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      }
    ]
  },
  {
    key: 'work',
    name: 'Work',
    sort_order: 3,
    modules: [
      {
        key: 'tickets',
        name: 'Tickets',
        sort_order: 1,
        pages: [
          { 
            key: 'plans', 
            name: 'Plans', 
            route: '/tickets/plans', 
            menu_title: 'Plans', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'select', 
            name: 'Tickets', 
            route: '/tickets/select', 
            menu_title: 'Tickets', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'buckets', 
            name: 'Buckets', 
            route: '/tickets/buckets', 
            menu_title: 'Buckets', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'bug_list', 
            name: 'Bug List', 
            route: '/tickets/bug-list', 
            menu_title: 'Bug List', 
            menu_order: 4,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'reports', 
            name: 'Reports', 
            route: '/tickets/reports', 
            menu_title: 'Reports', 
            menu_order: 5,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'settings', 
            name: 'Settings', 
            route: '/tickets/settings', 
            menu_title: 'Settings', 
            menu_order: 6,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'trash', 
            name: 'Trash', 
            route: '/tickets/trash', 
            menu_title: 'Trash', 
            menu_order: 7,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'archived', 
            name: 'Archived', 
            route: '/tickets/archived', 
            menu_title: 'Archived', 
            menu_order: 8,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'projects',
        name: 'Projects',
        sort_order: 2,
        pages: [
          { 
            key: 'manage', 
            name: 'Projects', 
            route: '/projects/manage', 
            menu_title: 'Projects', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'project_trash', 
            name: 'Trash', 
            route: '/projects/project-trash', 
            menu_title: 'Trash', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'time_tracking',
        name: 'Time Tracking',
        sort_order: 3,
        pages: [
          { 
            key: 'my', 
            name: 'My Tracking', 
            route: '/time-tracking/my', 
            menu_title: 'My Tracking', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'team', 
            name: 'Team Tracking', 
            route: '/time-tracking/team', 
            menu_title: 'Team Tracking', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'daily_updates',
        name: 'Daily Updates',
        sort_order: 4,
        pages: [
          { 
            key: 'submit', 
            name: 'Submit Update', 
            route: '/daily-updates/submit', 
            menu_title: 'Submit Update', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'view', 
            name: 'View Updates', 
            route: '/daily-updates/view', 
            menu_title: 'View Updates', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'document_hub',
        name: 'Document Hub',
        sort_order: 5,
        pages: [
          { 
            key: 'documenthub', 
            name: 'Document Hub', 
            route: '/documenthub', 
            menu_title: 'Document Hub', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'proposals',
        name: 'Proposals',
        sort_order: 6,
        pages: [
          { 
            key: 'all_proposals', 
            name: 'All Proposals', 
            route: '/proposals', 
            menu_title: 'All Proposals', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'builder', 
            name: 'Create Proposal', 
            route: '/proposals/builder', 
            menu_title: 'Create Proposal', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'sections', 
            name: 'Section Library', 
            route: '/proposals/sections', 
            menu_title: 'Section Library', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'templates', 
            name: 'Template Library', 
            route: '/proposals/templates', 
            menu_title: 'Template Library', 
            menu_order: 4,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'proposals_trash', 
            name: 'Trash', 
            route: '/proposals/trash', 
            menu_title: 'Trash', 
            menu_order: 5,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'squads',
        name: 'Squads',
        sort_order: 7,
        pages: [
          { 
            key: 'squad', 
            name: 'Squads', 
            route: '/squad', 
            menu_title: 'Squads', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'escalations',
        name: 'Escalations',
        sort_order: 8,
        pages: [
          { 
            key: 'escalation_list', 
            name: 'Escalation List', 
            route: '/escalations', 
            menu_title: 'Escalation List', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'escalation_settings', 
            name: 'Settings', 
            route: '/escalations/settings', 
            menu_title: 'Settings', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'escalation_trash', 
            name: 'Trash', 
            route: '/escalations/trash', 
            menu_title: 'Trash', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'lead_management',
        name: 'Lead Management',
        sort_order: 9,
        pages: [
          { 
            key: 'leads', 
            name: 'Leads', 
            route: '/leads', 
            menu_title: 'Leads', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'lead_settings', 
            name: 'Settings', 
            route: '/leads/settings', 
            menu_title: 'Settings', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'lead_trash', 
            name: 'Trash', 
            route: '/leads/trash', 
            menu_title: 'Trash', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'bidiq',
        name: 'BidIq',
        sort_order: 10,
        pages: [
          { 
            key: 'bidiq_page', 
            name: 'BidIq', 
            route: '/bidiq', 
            menu_title: 'BidIq', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      }
    ]
  },
  {
    key: 'admin',
    name: 'Admin',
    sort_order: 4,
    modules: [
      {
        key: 'clients_v2',
        name: 'Clients V2',
        sort_order: 1,
        pages: [
          { 
            key: 'clients_v2_page', 
            name: 'Clients V2', 
            route: '/clients-v2', 
            menu_title: 'Clients V2', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'settings',
        name: 'General Settings',
        sort_order: 2,
        pages: [
          { 
            key: 'settings_page', 
            name: 'General Settings', 
            route: '/settings', 
            menu_title: 'General Settings', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'roles',
        name: 'Roles & Permissions',
        sort_order: 3,
        pages: [
          { 
            key: 'roles_page', 
            name: 'Roles & Permissions', 
            route: '/roles', 
            menu_title: 'Roles & Permissions', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'org_structure',
        name: 'Org Structure',
        sort_order: 4,
        pages: [
          { 
            key: 'overview', 
            name: 'Overview', 
            route: '/org-structure/overview', 
            menu_title: 'Overview', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'grades', 
            name: 'Grades', 
            route: '/org-structure/grades', 
            menu_title: 'Grades', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'employment_type', 
            name: 'Employment Type', 
            route: '/org-structure/employment-type', 
            menu_title: 'Employment Type', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'department', 
            name: 'Department', 
            route: '/org-structure/department', 
            menu_title: 'Department', 
            menu_order: 4,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'sub_department', 
            name: 'Sub Department', 
            route: '/org-structure/sub-department', 
            menu_title: 'Sub Department', 
            menu_order: 5,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'position', 
            name: 'Position', 
            route: '/org-structure/position', 
            menu_title: 'Position', 
            menu_order: 6,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'members',
        name: 'Members',
        sort_order: 2,
        pages: [
          { 
            key: 'member_list', 
            name: 'Members', 
            route: '/members', 
            menu_title: 'Members', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'member_trash', 
            name: 'Trash', 
            route: '/members/trash', 
            menu_title: 'Trash', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      }
    ]
  },
  {
    key: 'hrms',
    name: 'HRMS',
    sort_order: 5,
    modules: [
      {
        key: 'profile',
        name: 'My Profile',
        sort_order: 1,
        pages: [
          { 
            key: 'profile_page', 
            name: 'My Profile', 
            route: '/profile', 
            menu_title: 'My Profile', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'new_profile',
        name: 'Profile 2.1',
        sort_order: 2,
        pages: [
          { 
            key: 'new_profile_page', 
            name: 'Profile 2.0', 
            route: '/new-profile', 
            menu_title: 'Profile 2.0', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'leaves_v2',
        name: 'Leaves',
        sort_order: 3,
        pages: [
          { 
            key: 'dashboard', 
            name: 'Dashboard', 
            route: '/leaves-v2/dashboard', 
            menu_title: 'Dashboard', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'applyleave', 
            name: 'Apply Leave', 
            route: '/leaves-v2/applyleave', 
            menu_title: 'Apply Leave', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'approvals', 
            name: 'Approvals', 
            route: '/leaves-v2/approvals', 
            menu_title: 'Approvals', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'government_holidays', 
            name: 'Government Holidays', 
            route: '/leaves-v2/government-holidays', 
            menu_title: 'Government Holidays', 
            menu_order: 4,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'leave_adjustment', 
            name: 'Leave Adjustment', 
            route: '/leaves-v2/leave-adjustment', 
            menu_title: 'Leave Adjustment', 
            menu_order: 5,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'leavetype', 
            name: 'Leave Type', 
            route: '/leaves-v2/leavetype', 
            menu_title: 'Leave Type', 
            menu_order: 6,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'leavepolicies', 
            name: 'Leave Policies', 
            route: '/leaves-v2/leavepolicies', 
            menu_title: 'Leave Policies', 
            menu_order: 7,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'add_government_holidays', 
            name: 'Add Government Holidays', 
            route: '/leaves-v2/add-government-holidays', 
            menu_title: 'Add Government Holidays', 
            menu_order: 8,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'configuration', 
            name: 'Configuration', 
            route: '/leaves-v2/configuration', 
            menu_title: 'Configuration', 
            menu_order: 9,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'attendance',
        name: 'Attendance',
        sort_order: 4,
        pages: [
          { 
            key: 'dashboard', 
            name: 'Dashboard', 
            route: '/attendance/dashboard', 
            menu_title: 'Dashboard', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'clock_in_out', 
            name: 'Clock In/Out', 
            route: '/attendance/clock-in-out', 
            menu_title: 'Clock In/Out', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'manage', 
            name: 'Manage', 
            route: '/attendance/manage', 
            menu_title: 'Manage', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'onboarding',
        name: 'Onboarding',
        sort_order: 5,
        pages: [
          { 
            key: 'employees', 
            name: 'Employees', 
            route: '/onboarding/employees', 
            menu_title: 'Employees', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'add_employee', 
            name: 'Add Employee', 
            route: '/onboarding/add-employee', 
            menu_title: 'Add Employee', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'invites', 
            name: 'Invites', 
            route: '/onboarding/invites', 
            menu_title: 'Invites', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'document', 
            name: 'Document', 
            route: '/onboarding/document', 
            menu_title: 'Document', 
            menu_order: 4,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'setting', 
            name: 'Setting', 
            route: '/onboarding/setting', 
            menu_title: 'Setting', 
            menu_order: 5,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'opening_management',
        name: 'Opening Management',
        sort_order: 6,
        pages: [
          { 
            key: 'opening_management_page', 
            name: 'Opening Management', 
            route: '/opening-management', 
            menu_title: 'Opening Management', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'performance_report',
        name: 'Performance Report',
        sort_order: 7,
        pages: [
          { 
            key: 'reports', 
            name: 'Reports', 
            route: '/performance-report/reports', 
            menu_title: 'Reports', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'settings', 
            name: 'Settings', 
            route: '/performance-report/settings', 
            menu_title: 'Settings', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'generated', 
            name: 'Generated Reports', 
            route: '/performance-report/generated', 
            menu_title: 'Generated Reports', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'my_reports', 
            name: 'My Reports', 
            route: '/performance-report/my-reports', 
            menu_title: 'My Reports', 
            menu_order: 4,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'employee_exit',
        name: 'Employee Exit',
        sort_order: 8,
        pages: [
          { 
            key: 'management', 
            name: 'Employee Exit Management', 
            route: '/employee-exit/management', 
            menu_title: 'Employee Exit Management', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'configuration', 
            name: 'Configuration', 
            route: '/employee-exit/configuration', 
            menu_title: 'Configuration', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      }
    ]
  },
  {
    key: 'finance',
    name: 'Finance',
    sort_order: 6,
    modules: [
      {
        key: 'accounts',
        name: 'Accounts',
        sort_order: 1,
        pages: [
          { 
            key: 'accounts_dashboard', 
            name: 'Dashboard', 
            route: '/accounts/accounts-dashboard', 
            menu_title: 'Dashboard', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'accounts_settings', 
            name: 'Settings', 
            route: '/accounts/settings', 
            menu_title: 'Settings', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'invoice',
        name: 'Invoice',
        sort_order: 2,
        pages: [
          { 
            key: 'invoice_dashboard', 
            name: 'Dashboard', 
            route: '/invoice/dashboard', 
            menu_title: 'Dashboard', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'invoices', 
            name: 'Invoices', 
            route: '/invoice/invoices', 
            menu_title: 'Invoices', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'newinvoice', 
            name: 'New Invoice', 
            route: '/invoice/newinvoice', 
            menu_title: 'New Invoice', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'invoice_templates', 
            name: 'Template', 
            route: '/invoice/templates', 
            menu_title: 'Template', 
            menu_order: 4,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'customers', 
            name: 'Customers', 
            route: '/invoice/customers', 
            menu_title: 'Customers', 
            menu_order: 5,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'invoice_settings', 
            name: 'Settings', 
            route: '/invoice/settings', 
            menu_title: 'Settings', 
            menu_order: 6,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'invoice_trash', 
            name: 'Trash', 
            route: '/invoice/trash', 
            menu_title: 'Trash', 
            menu_order: 7,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'reimbursement_v2',
        name: 'Reimbursement 2.0',
        sort_order: 3,
        pages: [
          { 
            key: 'dashboard', 
            name: 'Dashboard', 
            route: '/reimbursement-v2/dashboard', 
            menu_title: 'Dashboard', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'claims', 
            name: 'Claims', 
            route: '/reimbursement-v2/claims', 
            menu_title: 'Claims', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'approvals', 
            name: 'Approvals', 
            route: '/reimbursement-v2/approvals', 
            menu_title: 'Approvals', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'advances', 
            name: 'Advances', 
            route: '/reimbursement-v2/advances', 
            menu_title: 'Advances', 
            menu_order: 4,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'finance', 
            name: 'Finance', 
            route: '/reimbursement-v2/finance', 
            menu_title: 'Finance', 
            menu_order: 5,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'policies', 
            name: 'Policies', 
            route: '/reimbursement-v2/policies', 
            menu_title: 'Policies', 
            menu_order: 6,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'budgets', 
            name: 'Budgets', 
            route: '/reimbursement-v2/budgets', 
            menu_title: 'Budgets', 
            menu_order: 7,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'categories', 
            name: 'Categories', 
            route: '/reimbursement-v2/categories', 
            menu_title: 'Categories', 
            menu_order: 8,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      },
      {
        key: 'payroll_v2',
        name: 'Payroll 2.5',
        sort_order: 4,
        pages: [
          { 
            key: 'components', 
            name: 'Components', 
            route: '/payroll-v2/components', 
            menu_title: 'Components', 
            menu_order: 6,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'employees', 
            name: 'Employees', 
            route: '/payroll-v2/employees', 
            menu_title: 'Employees', 
            menu_order: 3,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'run_payroll', 
            name: 'Run Payroll', 
            route: '/payroll-v2/run-payroll', 
            menu_title: 'Run Payroll', 
            menu_order: 4,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'reports', 
            name: 'Reports', 
            route: '/payroll-v2/reports', 
            menu_title: 'Reports', 
            menu_order: 5,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'my_payslips', 
            name: 'My Payslips', 
            route: '/payroll-v2/my-payslips', 
            menu_title: 'My Payslips', 
            menu_order: 1,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'schedules', 
            name: 'Schedules', 
            route: '/payroll-v2/schedules', 
            menu_title: 'Schedules', 
            menu_order: 7,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'structures', 
            name: 'Structures', 
            route: '/payroll-v2/structures', 
            menu_title: 'Structures', 
            menu_order: 13,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'statutory', 
            name: 'Statutory', 
            route: '/payroll-v2/statutory', 
            menu_title: 'Statutory', 
            menu_order: 8,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'state_statutory', 
            name: 'State Statutory', 
            route: '/payroll-v2/state-statutory', 
            menu_title: 'State Statutory', 
            menu_order: 9,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'workflows', 
            name: 'Workflows', 
            route: '/payroll-v2/workflows', 
            menu_title: 'Workflows', 
            menu_order: 10,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'payslip_template', 
            name: 'Payslip Template', 
            route: '/payroll-v2/payslip-template', 
            menu_title: 'Payslip Template', 
            menu_order: 2,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          },
          { 
            key: 'settings', 
            name: 'Settings', 
            route: '/payroll-v2/settings', 
            menu_title: 'Settings', 
            menu_order: 12,
            features: [
              { key: 'prime', name: 'Prime', featureType: 'PRIME' },
              { key: 'grid', name: 'Grid', featureType: 'GRID' }
            ]
          }
        ]
      }
    ]
  }
];
