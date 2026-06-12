-- Replace the password hash before using this seed in production.
insert into app_users (full_name, email, password_hash, role)
values (
  'System Administrator',
  'admin@example.com',
  '$2a$12$replace_this_hash_before_production',
  'admin'
)
on conflict (email) do nothing;
