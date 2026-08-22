-- Adds persistent star/favorite support for watchlist items.
-- Safe to run on existing databases.

alter table public.watchlist_items
    add column if not exists is_starred boolean;

update public.watchlist_items
set is_starred = false
where is_starred is null;

alter table public.watchlist_items
    alter column is_starred set default false;

alter table public.watchlist_items
    alter column is_starred set not null;

create index if not exists watchlist_items_watchlist_starred_idx
    on public.watchlist_items (watchlist_id, is_starred);

comment on column public.watchlist_items.is_starred is
    'Marks a watchlist item as starred so users can filter favorite setups.';
