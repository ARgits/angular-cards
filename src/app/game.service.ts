import {Injectable} from '@angular/core';
import {Card} from "./Card";
import {SupabaseService} from "./supabase.service";
import {FileObject} from "@supabase/storage-js";
import {VictoryDialogComponent} from "./victory-dialog/victory-dialog.component";
import {MatDialog, MatDialogRef} from "@angular/material/dialog";
import {Session} from "@supabase/supabase-js";
import {TimerService} from "./timer.service";
import {AnimationService} from "./animation.service";

@Injectable({
  providedIn: 'root'
})
export class GameService {
  cards: Card[] = []
  numberOfCards: number = 52
  numberOfStack: number = 7
  suit: string[] = ['clubs', 'diamonds', 'spades', 'hearts']
  casing: string[] = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king']
  theme: string
  cardsBucketData: FileObject[] | undefined
  stacks: Set<string> = new Set(['hiddenStore', 'shownStore', 'final-1', 'final-2', 'final-3', 'final-4'])
  dialogRef: MatDialogRef<any> | null = null;
  session: Session | null = null
  state: string = 'paused'
  cardChanging: boolean = false
  readonly cardsDistribution: number[] = []

  get user() {
    return this.session?.user
  }

  constructor(private readonly supabase: SupabaseService,
              public dialog: MatDialog,
              private readonly timer: TimerService,
              private readonly animate: AnimationService) {
    this.theme = 'webp'
    supabase.getSession().then(({data: {session}}) => this.session = session)
    this.cardsDistribution = ([] as number[]).concat(...Array(this.numberOfStack).fill(null).map((item, index) => Array(index + 1).fill(null).map(() => index + 1)))
  }

  set gameFinished(isFinished: boolean) {
    if (isFinished) {
      this.callVictoryDialog()
      this.state = 'paused'
      if (this.user) {
        const {timeRecords} = this.user.user_metadata
        timeRecords.push(this.timer.gameTime)
        const timeBest = Math.min(...timeRecords)
        this.supabase.updateUser({timeRecords, timeBest}).then((value) => console.log('user data successfully updated: ', value))
      }
    }
  }

  set cardsTheme(theme: string) {
    this.startGame(theme).then(() => {
      console.log('Game has Started')
    })
  }

  async startGame(theme: string) {
    try {
      console.log('creation cards')
      this.createCards()
      if (!this.cards.length) {
        return
      }
      this.shuffle()
      const cardsBucket = await this.supabase.cards
      const {data} = await cardsBucket.list(theme)
      if (!data) {
        return
      }
      this.cardsBucketData = data
      console.log(data)
      for (const card of this.cards) {
        card.srcCasing = await this.getCardSRC(card)
        card.srcBack = <string>(await this.supabase.downLoadImage("webp/Card_back.webp")).data.publicUrl
      }
      this.sortCardsByStack()

    } catch ({message}) {
      console.error('Error getting cards from Cards Game object:  ', message)
    }
  }

  restartGame() {
    if (!this.cards.length) {
      this.startGame('webp').then(() => console.log('Game has Started'))
    }
    else {
      if (!this.animate.returnCardsAnimation) {
        this.animate.returnCardsAnimation = this.animate.returnToHiddenStore(
          () => {
            this.cards.filter(c => c.stack !== 'hiddenStore').forEach(c => {
              c.stack = 'hiddenStore';
              c.shown = false
            })
            console.log('end of return to hidden store animation')
            this.shuffle()
            this.animate.returnCardsAnimation = null
            this.sortCardsByStack()
          })
      }
      this.animate.returnCardsAnimation.play().then(() => console.log(this.cards.map(c => {return {stack: c.stack, id: c.id, shown: c.shown}})))
    }
  }

  async getCardSRC(card: Card) {
    if (!this.cardsBucketData) {
      return "webp/Card_back.webp"
    }
    const dataCard = this.cardsBucketData.find(item => item.name.includes(card.casing) && item.name.includes(card.suit))
    const src = dataCard ? `${this.theme}/${dataCard.name}` : "webp/Card_back.webp"
    return <string>(await this.supabase.downLoadImage(src)).data.publicUrl
  }

  createCards() {
    if (this.cards.length) {
      for (const card of this.cards) {
        card.shown = false
      }
    }
    else {
      for (const s of this.suit) {
        for (const [index, c] of this.casing.entries()) {
          const color = s === 'diamonds' || s === 'hearts' ? "red" : "black"
          const card: Card = {
            suit: s,
            casing: c,
            id: `card_${c}_of_${s}`,
            height: 200,
            width: 138,
            priority: index,
            srcCasing: '',
            stack: 'hiddenStore',
            shown: false,
            color,
            srcBack: ''
          }
          this.cards.push(card)
        }
      }
    }
  }

  sortCardsByStack() {
    const animation = this.animate.newGameAnimation(this.cardsDistribution,
      (id) => {
        /*const card = this.cards.filter(c => c.id === id)[0]
        //const card = this.cards[index]
        const index = this.cards.findIndex(c => c.id === id)
        const num = this.cardsDistribution[index]
        card.shown = this.cardsDistribution[index + 1] !== num*/
      },
      () => {
        console.log('end of new GameAnimation')
        for (const [index, num] of this.cardsDistribution.entries()) {
          const card = this.cards[index]
          this.stacks.add(`bottom-${num}`)
          card.stack = `bottom-${num}`
          card.shown = this.cardsDistribution[index + 1] !== num
        }
        this.state = 'active'
        this.timer.gameTime = 0
      }
    )
    animation.restart().then(() => console.log(this.cards.map(c => {return {stack: c.stack, id: c.id, shown: c.shown}})))
  }

  shuffle() {
    console.log('shuffle started')
    if (!this.cards.length) {
      return console.error('cards object not defined')
    }
    const newCards = [...this.cards]
    let m = newCards.length, t, i
    while (m) {
      i = Math.floor(Math.random() * m--)
      t = newCards[m]
      newCards[m] = newCards[i]
      newCards[i] = t
    }
    this.cards = [...newCards]
    console.log('shuffle finished')
  }

  async getFromHiddenStore(card: Card) {
    const index = this.cards.findIndex(c => c.id === card.id)
    if (!index) {
      return
    }
    this.cards.splice(index, 1)
    card.shown = true
    card.stack = 'shownStore'
    this.cards.push(card)
  }

  async refreshHiddenStore() {
    const shownStore = this.cards.filter(c => c.stack === 'shownStore')
    for (let card of shownStore) {
      const index = this.cards.findIndex(c => c.id === card.id)
      if (index) {
        this.cards.splice(index, 1)
        card.stack = 'hiddenStore'
        card.shown = false
      }
    }
    this.cards = [...this.cards, ...shownStore.reverse()]
  }

  checkCorrectCardPosition(movingCard: Card, newStack: string) {
    const stackPriority = newStack.includes('final') ? -1 : 1
    const lastCard = this.cards.filter(c => c.stack === newStack).at(-1)
    if (lastCard) {
      const {color, suit, priority} = lastCard
      if (stackPriority === 1 && color === movingCard.color) {
        console.error(`wrong color: ${stackPriority}, ${color}, ${movingCard.color}`)
        return false
      }
      if (stackPriority === -1 && suit !== movingCard.suit) {
        console.error(`wrong suit in final stack: ${stackPriority}, ${suit}, ${movingCard.suit}`)
        return false
      }
      if (priority - movingCard.priority !== stackPriority) {
        console.error(`wrong priority: ${stackPriority}, ${priority}, ${movingCard.priority}`)
        return false
      }
    }
    else if ((movingCard.casing !== 'king' && stackPriority === 1) || (movingCard.casing !== 'ace' && stackPriority === -1)) {
      console.error(`you can't put card on empty stack if it not king or ace (if priority===-1): ${stackPriority}, ${movingCard.casing}`)
      return false
    }
    return true
  }

// @ts-ignore
  changeStack(cards: Card[], newStack: string) {
    if (this.cardChanging) {
      return console.error(`other card already changing`)
    }
    console.log('start to move cards: ', cards)
    const oldStack = cards[0].stack
    const priority = newStack.includes('final') ? -1 : 1
    /*const check = this.checkCorrectCardPosition(cards[0], newStack)
    if (!check) {
      return
    }*/
    for (const card of cards) {
      const cardIndex = this.cards.findIndex(c => c.id === card.id)
      this.cards?.splice(cardIndex, 1)
      card.stack = newStack
    }
    const previousStackNewLastCard = this.cards.filter(c => c.stack === oldStack).at(-1)
    if (previousStackNewLastCard) {
      const previousStackNewLastCardIndex = this.cards.findIndex(c => c.id === previousStackNewLastCard.id)
      this.cards.splice(previousStackNewLastCardIndex, 1)
      previousStackNewLastCard.shown = true
    }
    const newCards = <Card[]>[...cards, previousStackNewLastCard].filter(c => c).sort((a, b) => (priority * (b!.priority - a!.priority)))
    this.cards = [...this.cards, ...newCards]
    this.cardChanging = false
    this.gameFinished = this.cards.length === this.cards.filter(card => card.stack.includes('final')).length
    console.log('finished move cards: ', cards)
  }

  finalSort(excludeStack
              :
              string[] = []
  ):
    void {
    /*const storeLength = this.cards.filter((card) => card.stack.includes('hiddenStore')).length
    if (storeLength) {
      return
    }*/
    const shownCards = this.cards.filter((card) => card.shown && !excludeStack.includes(card.stack))
    if (!
      shownCards.length
    ) {
      return;
    }
    const lastCard = shownCards.at(-1)!
    const finalStack = this.getFinalStackForCard(lastCard)
    const check = this.checkCorrectCardPosition(lastCard, finalStack)
    if (check) {
      this.animate.moveCard(lastCard, finalStack, () => {
        this.changeStack([lastCard], finalStack);
        this.finalSort()
      })
    }
    else {
      excludeStack.push(lastCard.stack)
      this.finalSort(excludeStack)
    }
    console.log('final sort excluded stacks: ', excludeStack)
  }

  getFinalStackForCard(card
                         :
                         Card
  ) {
    const {suit} = card
    let stackId = this.cards.filter(c => c.suit === suit && c.stack.includes('final'))[0]?.stack
    if (!stackId) {
      const index = [1, 2, 3, 4].reduce((previousValue, currentValue) => {
        if (this.cards.filter(c => c.stack === `final-${previousValue}`).length) {
          return currentValue
        }
        else {
          return previousValue
        }
      })
      stackId = `final-${index}`
    }
    return stackId
  }

  callVictoryDialog() {
    this.dialogRef = this.dialog.open(VictoryDialogComponent, {
      id: 'victoryDialog',
      width: 'fit-content',
    })
    this.dialogRef.afterClosed().subscribe(() => {
      this.dialogRef = null
    })
  }

}
