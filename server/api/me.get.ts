export default defineEventHandler(async (event) => {
  return await requireAppUser(event)
})
