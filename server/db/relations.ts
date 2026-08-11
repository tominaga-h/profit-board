import { relations } from "drizzle-orm/relations";
import { mProjects, tCosts, mUsers, tSales, tStatus } from "./schema";

export const tCostsRelations = relations(tCosts, ({one}) => ({
	mProject: one(mProjects, {
		fields: [tCosts.projectId],
		references: [mProjects.id]
	}),
	mUser: one(mUsers, {
		fields: [tCosts.userId],
		references: [mUsers.id]
	}),
}));

export const mProjectsRelations = relations(mProjects, ({many}) => ({
	tCosts: many(tCosts),
	tSales: many(tSales),
	tStatuses: many(tStatus),
}));

export const mUsersRelations = relations(mUsers, ({many}) => ({
	tCosts: many(tCosts),
}));

export const tSalesRelations = relations(tSales, ({one}) => ({
	mProject: one(mProjects, {
		fields: [tSales.projectId],
		references: [mProjects.id]
	}),
}));

export const tStatusRelations = relations(tStatus, ({one}) => ({
	mProject: one(mProjects, {
		fields: [tStatus.projectId],
		references: [mProjects.id]
	}),
}));