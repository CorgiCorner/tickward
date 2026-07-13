export function isValidEmailAddress(email: string) {
  let atIndex = -1

  for (let index = 0; index < email.length; index += 1) {
    const character = email[index]!
    if (character.trim() === "") return false
    if (character !== "@") continue
    if (atIndex !== -1) return false
    atIndex = index
  }

  if (atIndex <= 0 || atIndex >= email.length - 1) return false
  const dotIndex = email.indexOf(".", atIndex + 1)
  return dotIndex > atIndex + 1 && dotIndex < email.length - 1
}
