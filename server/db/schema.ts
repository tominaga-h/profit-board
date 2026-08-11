// drizzle-kit pull はスキーマ更新の起点にしない。
// 変更の正は supabase/migrations/*.sql（Supabase CLI 管理）であり、
// generate / push / migrate はここでは一切使わない。
// `make db-drizzle-pull` は drift 検知専用で、出力は .drizzle-pull/（gitignore 済み）
// に隔離される。スキーマ変更時は .drizzle-pull/schema.ts と本ファイルを diff し、
// 必要な差分だけを手動で反映すること。pull の生成物をそのまま採用してはいけない
// （numeric 列の mode: 'number' が生成物には付かないため、計算ロジックが壊れる）。
import { pgTable, index, foreignKey, pgPolicy, serial, integer, varchar, numeric, timestamp, unique, text } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const tCosts = pgTable("t_costs", {
	id: serial().primaryKey().notNull(),
	fiscalYear: integer("fiscal_year").notNull(),
	month: integer().notNull(),
	projectId: integer("project_id").notNull(),
	userId: integer("user_id"),
	costType: varchar("cost_type", { length: 50 }).default('LABOR').notNull(),
	// mode: 'number' 必須。既定では numeric は string 型になり、計算ロジックが壊れる。
	workHours: numeric("work_hours", { precision: 6, scale: 2, mode: 'number' }).default(0),
	workDays: numeric("work_days", { precision: 6, scale: 2, mode: 'number' }).default(0),
	unitPrice: numeric("unit_price", { precision: 12, scale: 0, mode: 'number' }).default(0),
	amount: numeric({ precision: 12, scale: 0, mode: 'number' }).default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_t_costs_fy_month_project").using("btree", table.fiscalYear.asc().nullsLast().op("int4_ops"), table.month.asc().nullsLast().op("int4_ops"), table.projectId.asc().nullsLast().op("int4_ops")),
	index("idx_t_costs_project_id").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	index("idx_t_costs_user_id").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [mProjects.id],
			name: "t_costs_project_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [mUsers.id],
			name: "t_costs_user_id_fkey"
		}),
	pgPolicy("t_costs_delete_app_user", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`( SELECT is_app_user() AS is_app_user)` }),
	pgPolicy("t_costs_insert_app_user", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("t_costs_select_app_user", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("t_costs_update_app_user", { as: "permissive", for: "update", to: ["authenticated"] }),
]);

export const mUsers = pgTable("m_users", {
	id: serial().primaryKey().notNull(),
	familyName: varchar("family_name", { length: 50 }).notNull(),
	firstName: varchar("first_name", { length: 50 }).notNull(),
	email: varchar({ length: 255 }).notNull(),
	unitPrice: numeric("unit_price", { precision: 12, scale: 0, mode: 'number' }).default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("m_users_email_key").on(table.email),
	pgPolicy("m_users_delete_app_user", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`( SELECT is_app_user() AS is_app_user)` }),
	pgPolicy("m_users_insert_app_user", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("m_users_select_app_user", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("m_users_update_app_user", { as: "permissive", for: "update", to: ["authenticated"] }),
]);

export const mProjects = pgTable("m_projects", {
	id: serial().primaryKey().notNull(),
	serviceName: varchar("service_name", { length: 255 }).notNull(),
	companyName: varchar("company_name", { length: 255 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	pgPolicy("m_projects_delete_app_user", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`( SELECT is_app_user() AS is_app_user)` }),
	pgPolicy("m_projects_insert_app_user", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("m_projects_select_app_user", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("m_projects_update_app_user", { as: "permissive", for: "update", to: ["authenticated"] }),
]);

export const tSales = pgTable("t_sales", {
	id: serial().primaryKey().notNull(),
	fiscalYear: integer("fiscal_year").notNull(),
	month: integer().notNull(),
	projectId: integer("project_id").notNull(),
	categorySmall: varchar("category_small", { length: 100 }).notNull(),
	amount: numeric({ precision: 12, scale: 0, mode: 'number' }).default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_t_sales_fy_month_project").using("btree", table.fiscalYear.asc().nullsLast().op("int4_ops"), table.month.asc().nullsLast().op("int4_ops"), table.projectId.asc().nullsLast().op("int4_ops")),
	index("idx_t_sales_project_id").using("btree", table.projectId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [mProjects.id],
			name: "t_sales_project_id_fkey"
		}),
	pgPolicy("t_sales_delete_app_user", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`( SELECT is_app_user() AS is_app_user)` }),
	pgPolicy("t_sales_insert_app_user", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("t_sales_select_app_user", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("t_sales_update_app_user", { as: "permissive", for: "update", to: ["authenticated"] }),
]);

export const tStatus = pgTable("t_status", {
	id: serial().primaryKey().notNull(),
	fiscalYear: integer("fiscal_year").notNull(),
	month: integer().notNull(),
	projectId: integer("project_id").notNull(),
	remark: text(),
	updatedBy: varchar("updated_by", { length: 255 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [mProjects.id],
			name: "t_status_project_id_fkey"
		}),
	unique("t_status_fiscal_year_month_project_id_key").on(table.fiscalYear, table.month, table.projectId),
	pgPolicy("t_status_delete_app_user", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`( SELECT is_app_user() AS is_app_user)` }),
	pgPolicy("t_status_insert_app_user", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("t_status_select_app_user", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("t_status_update_app_user", { as: "permissive", for: "update", to: ["authenticated"] }),
]);

export const mFiscalYears = pgTable("m_fiscal_years", {
	id: serial().primaryKey().notNull(),
	year: integer().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("m_fiscal_years_year_key").on(table.year),
	pgPolicy("m_fiscal_years_delete_app_user", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`( SELECT is_app_user() AS is_app_user)` }),
	pgPolicy("m_fiscal_years_insert_app_user", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("m_fiscal_years_select_app_user", { as: "permissive", for: "select", to: ["authenticated"] }),
	pgPolicy("m_fiscal_years_update_app_user", { as: "permissive", for: "update", to: ["authenticated"] }),
]);
