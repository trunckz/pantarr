import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Role } from "@prisma/client";

export const PUBLIC = "pantarr:public";
export const ROLES = "pantarr:roles";
/** Route open without authentication. */
export const Public = () => SetMetadata(PUBLIC, true);
/** Route reserved to some roles (admin). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
export const HOUSEHOLD_ADMIN = "pantarr:household-admin";
/** Route of a household (« :id ») reserved to administrators and to the owners of that household. */
export const HouseholdAdmin = () => SetMetadata(HOUSEHOLD_ADMIN, true);

export interface AuthUser { id: string; email: string; name: string; role: Role; locale: string; via: "session" | "api-key"; scopes: string[] }
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
