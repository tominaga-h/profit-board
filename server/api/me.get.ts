/**
 * クライアント型（database.types.ts 由来）は snake_case のため、members.get.ts と同様に
 * ここで camelCase の AppUser から詰め替える。
 */
export default defineEventHandler(async (event) => {
  const user = await requireAppUser(event)

  return {
    id: user.id,
    family_name: user.familyName,
    first_name: user.firstName,
    email: user.email,
    unit_price: user.unitPrice,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  }
})
