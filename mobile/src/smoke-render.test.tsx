import { Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'

// Prova ponta a ponta que o harness aplica o transform RN do `jest-expo`:
// importa `react-native`, monta um primitivo sob `render()` e le a arvore
// resultante. Nao acopla a nenhum modulo de produto (nem de template) de
// proposito — o unico objetivo e travar que `import 'react-native'` compila e
// renderiza sob Jest.
describe('RN transform + render()', () => {
  it('mounts a react-native primitive and finds its text', () => {
    render(<Text>ok</Text>)
    expect(screen.getByText('ok')).toBeTruthy()
  })
})
