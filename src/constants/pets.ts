export type PetSkinId = 'realistic-british-shorthair' | 'realistic-shiba-inu'

export interface PetSkin {
  id: PetSkinId
  name: string
  breed: string
  kind: 'cat' | 'dog'
  spritesheet: string
  sleepFrame: number
  source: string
  spriteRows: 9 | 11
  accent: string
  tagline: string
}

export const PET_SKINS: readonly PetSkin[] = [
  {
    id: 'realistic-british-shorthair',
    name: '奶盖',
    breed: '蓝灰英国短毛猫',
    kind: 'cat',
    spritesheet: '/pets/realistic-british-shorthair/spritesheet.webp',
    sleepFrame: 2,
    source: 'DrumCat original semi-realistic 3D artwork',
    spriteRows: 11,
    accent: '#7587a4',
    tagline: '铜金眼睛，沉稳又黏人的短绒搭子',
  },
  {
    id: 'realistic-shiba-inu',
    name: '栗子',
    breed: '赤色柴犬',
    kind: 'dog',
    spritesheet: '/pets/realistic-shiba-inu/spritesheet.webp',
    sleepFrame: 2,
    source: 'DrumCat original semi-realistic 3D artwork',
    spriteRows: 11,
    accent: '#c98148',
    tagline: '立耳卷尾，精神又温暖的工作搭子',
  },
] as const

export const DEFAULT_PET_SKIN_ID: PetSkinId = 'realistic-british-shorthair'

export function getPetSkin(id: string | undefined): PetSkin {
  return PET_SKINS.find(skin => skin.id === id)
    ?? PET_SKINS.find(skin => skin.id === DEFAULT_PET_SKIN_ID)!
}

export function isPetSkinId(value: string): value is PetSkinId {
  return PET_SKINS.some(skin => skin.id === value)
}
