export interface MenuItem {
  name: string
  label: string
  icon: string
  activeIcon: string
}

const allMenuItems: MenuItem[] = [
  {
    name: 'portfolio',
    label: 'Portfolio',
    icon: 'portfolio-outline',
    activeIcon: 'portfolio-filled',
  },
  {
    name: 'explore',
    label: 'Explore',
    icon: 'nodes',
    activeIcon: 'nodes',
  },
  {
    name: 'earn',
    label: 'Earn',
    icon: 'earn-outline',
    activeIcon: 'earn-filled',
  },
  {
    name: 'lend',
    label: 'Lend',
    icon: 'lend-outline',
    activeIcon: 'lend-filled',
  },
  {
    name: 'borrow',
    label: 'Borrow',
    icon: 'borrow-outline',
    activeIcon: 'borrow-filled',
  },
  {
    name: 'loop-zap',
    label: 'Loop Zap',
    icon: 'borrow-outline',
    activeIcon: 'borrow-filled',
  },
]

export const getMenuItems = (enableEarnPage: boolean, enableLendPage: boolean, enableExplorePage: boolean, enableLoopZapPage: boolean = false) => {
  return allMenuItems.filter((item) => {
    if (item.name === 'explore' && !enableExplorePage) return false
    if (item.name === 'lend' && !enableLendPage) return false
    if (item.name === 'earn' && !enableEarnPage) return false
    if (item.name === 'loop-zap' && !enableLoopZapPage) return false
    return true
  })
}

const preferredDefaultOrder = ['explore', 'earn', 'lend', 'borrow', 'loop-zap', 'portfolio'] as const

export const getDefaultPageRoute = (enableEarnPage: boolean, enableLendPage: boolean, enableExplorePage: boolean, enableLoopZapPage: boolean = false) => {
  const items = getMenuItems(enableEarnPage, enableLendPage, enableExplorePage, enableLoopZapPage)
  return preferredDefaultOrder.find(name =>
    items.some(item => item.name === name),
  ) ?? 'portfolio'
}
